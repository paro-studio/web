-- Closes the gaps a pre-launch review found in moderation and push
-- notifications, plus two small ones.
--
-- 1. A prompt's image cannot be swapped after it passed moderation.
--    moderate-prompt checks the file a prompt points at when the prompt is
--    posted, or when image_url changes. But the file itself could be deleted
--    and a different picture uploaded under the same name: same address, so
--    nothing ran again. Now a file name that a prompt points at cannot be
--    uploaded again, and a prompt can only point at a file that exists, which
--    also stops a post going up before its picture does.
--
-- 2. Editing only the words is checked too, and edits are limited.
--    The moderation trigger fired on image_url alone, so a title, prompt or
--    tags edit was never checked. It is recreated below to fire on all four.
--    Every check costs a call to OpenAI and can post to Discord, so changes to
--    those four columns are capped at 20 a day per person.
--
-- 3. Push notifications are only requested when one could be sent.
--    Every like, follow and rating used to call send-push, which then worked
--    out that, say, the person had already been told. Liking and unliking in a
--    loop could spend the free plan's function calls in hours. The decision
--    is now made here first: nobody told twice, likes and ratings spaced
--    ten minutes apart per prompt, no call for someone without a phone or who
--    has blocked the person. send-push still applies the same rules itself.
--
-- 4. Likes, follows and ratings get their time from the database. A client
--    could send any created_at, and a like dated 2099 would sit at the top of
--    the owner's Activity for good.
--
-- 5. A prompt's owner no longer adds views to their own prompt, the same rule
--    copies already follow.
--
-- The triggers that call Edge Functions carry the shared webhook secret, so
-- they were created by hand in the SQL editor and are not in any migration.
-- Parts 2 and 3 rebuild them from the ones already there: the secret is read
-- out of the existing trigger and moved into Vault, and never appears here.
-- On a database without those triggers (CI, a fresh project) both parts do
-- nothing.

begin;

-- ---------------------------------------------------------------------------
-- 1. No swapping a prompt's image
-- ---------------------------------------------------------------------------

-- The storage path a prompt-images address points at, without any ?query.
create or replace function public.prompt_image_path(url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(split_part(url, '?', 1), '^.*/storage/v1/object/public/prompt-images/', ''),
    split_part(url, '?', 1)
  );
$$;

-- Whether any prompt points at this file. Security definer: the storage
-- policy that calls it runs as the uploader, who may not see every prompt
-- column, and it must see them all.
create or replace function public.prompt_image_in_use(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.prompts p
     where p.user_id::text = split_part(object_name, '/', 1)
       and public.prompt_image_path(p.image_url) = object_name
  );
$$;

revoke all on function public.prompt_image_in_use(text) from public, anon;
grant execute on function public.prompt_image_in_use(text) to authenticated;

-- Whether the file behind an address has been uploaded.
create or replace function public.prompt_image_exists(url text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from storage.objects o
     where o.bucket_id = 'prompt-images'
       and o.name = public.prompt_image_path(url)
  );
$$;

revoke all on function public.prompt_image_exists(text) from public, anon;
grant execute on function public.prompt_image_exists(text) to authenticated;

drop policy if exists "Users can upload own prompt images" on storage.objects;
create policy "Users can upload own prompt images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'prompt-images'
    and name ~ ('^' || (auth.uid())::text || '/[^/]+$')
    and public.prompt_image_quota_ok()
    and not public.prompt_image_in_use(name)
  );

-- As in 20261007020000, plus: the file has to be there.
create or replace function public.check_prompt_image_url()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.image_url !~ public.storage_url_pattern('prompt-images', new.user_id::text) then
    raise exception 'Prompt images must be uploaded through the app.'
      using errcode = '23514';
  end if;

  if not public.prompt_image_exists(new.image_url) then
    raise exception 'Upload the image before posting the prompt.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Word edits are checked, and edits are limited
-- ---------------------------------------------------------------------------

create table if not exists public.prompt_edit_events (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists prompt_edit_events_user_idx
  on public.prompt_edit_events (user_id, created_at desc);

alter table public.prompt_edit_events enable row level security;
revoke all on public.prompt_edit_events from anon, authenticated;

-- Counts real changes only: saving the form as it was costs nothing. The
-- counter triggers and the dashboard never reach the limit, since they act
-- without a signed in user.
create or replace function public.limit_prompt_edits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  made integer;
begin
  if uid is null then
    return new;
  end if;

  if new.image_url is not distinct from old.image_url
     and new.title is not distinct from old.title
     and new.prompt is not distinct from old.prompt
     and new.tags is not distinct from old.tags then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('prompt_edits:' || uid::text));

  delete from public.prompt_edit_events
   where user_id = uid
     and created_at < now() - interval '2 days';

  select count(*) into made
    from public.prompt_edit_events
   where user_id = uid
     and created_at >= now() - interval '24 hours';

  if made >= 20 then
    raise exception 'Daily edit limit reached. Try again tomorrow.'
      using errcode = 'P0001';
  end if;

  insert into public.prompt_edit_events (user_id) values (uid);
  return new;
end;
$$;

revoke all on function public.limit_prompt_edits() from public, anon, authenticated;

drop trigger if exists limit_prompt_edits on public.prompts;
create trigger limit_prompt_edits
  before update of image_url, title, prompt, tags on public.prompts
  for each row execute function public.limit_prompt_edits();

-- The moderation trigger, rebuilt to fire on the words as well.
do $$
declare
  args text[];
begin
  select string_to_array(encode(t.tgargs, 'escape'), '\000')
    into args
    from pg_trigger t
   where t.tgname = 'moderate_changed_prompt_image'
     and t.tgrelid = 'public.prompts'::regclass;

  if args is null then
    return;
  end if;

  drop trigger moderate_changed_prompt_image on public.prompts;
  execute format(
    'create trigger moderate_changed_prompt_image
       after update of image_url, title, prompt, tags on public.prompts
       for each row execute function supabase_functions.http_request(%L, %L, %L, %L, %L)',
    args[1], args[2], args[3], args[4], args[5]);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Ask send-push only when there is something to send
-- ---------------------------------------------------------------------------

-- Fired after a follow, like or rating. Applies the rules send-push applies,
-- from the same tables, and calls it only if they all pass. The address and
-- the secret come from Vault, under the names below.
create or replace function public.request_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  what      text;
  actor     uuid;
  recipient uuid;
  about     uuid;
  base_url  text;
  secret    text;
begin
  if tg_table_name = 'follows' then
    what := 'follow';
    actor := new.follower_id;
    recipient := new.following_id;
    about := null;
  else
    what := case tg_table_name when 'likes' then 'like' else 'rating' end;
    actor := new.user_id;
    about := new.prompt_id;
    select p.user_id into recipient from public.prompts p where p.id = new.prompt_id;
  end if;

  if recipient is null or recipient = actor then
    return null;
  end if;

  -- No phone to send to.
  if not exists (select 1 from public.push_tokens t where t.user_id = recipient) then
    return null;
  end if;

  -- Blocked by the person it would go to.
  if exists (
    select 1 from public.blocks b where b.blocker_id = recipient and b.blocked_id = actor
  ) then
    return null;
  end if;

  -- Already told this, by this person.
  if exists (
    select 1
      from public.notification_events e
     where e.recipient_id = recipient
       and e.actor_id = actor
       and e.kind = what
       and e.prompt_id is not distinct from about
  ) then
    return null;
  end if;

  -- A like or rating on this prompt was announced in the last ten minutes.
  if about is not null and exists (
    select 1
      from public.notification_events e
     where e.recipient_id = recipient
       and e.kind = what
       and e.prompt_id = about
       and e.created_at > now() - interval '10 minutes'
  ) then
    return null;
  end if;

  select s.decrypted_secret into base_url
    from vault.decrypted_secrets s where s.name = 'paro_functions_url';
  select s.decrypted_secret into secret
    from vault.decrypted_secrets s where s.name = 'paro_webhook_secret';
  if base_url is null or secret is null then
    return null;
  end if;

  perform net.http_post(
    url := base_url || '/send-push',
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', tg_table_name,
      'record', jsonb_build_object('id', new.id)
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', secret
    ),
    timeout_milliseconds := 10000
  );

  return null;
end;
$$;

revoke all on function public.request_push() from public, anon, authenticated;

-- Moves the address and secret out of the hand-made push_on_like trigger into
-- Vault, then swaps all three hand-made triggers for ones that go through
-- request_push. Nothing happens where push_on_like does not exist.
do $$
declare
  args    text[];
  base    text;
  secret  text;
begin
  select string_to_array(encode(t.tgargs, 'escape'), '\000')
    into args
    from pg_trigger t
   where t.tgname = 'push_on_like'
     and t.tgrelid = 'public.likes'::regclass
     -- Already swapped, on a second run: nothing to do.
     and t.tgfoid <> 'public.request_push'::regproc;

  if args is null then
    return;
  end if;

  base := regexp_replace(args[1], '/send-push$', '');
  secret := (args[3]::jsonb) ->> 'x-webhook-secret';
  if base = args[1] or secret is null then
    raise exception 'push_on_like does not look as expected; left as it is';
  end if;

  if not exists (select 1 from vault.secrets where name = 'paro_functions_url') then
    perform vault.create_secret(base, 'paro_functions_url', 'Edge Functions address, for request_push');
  end if;
  if not exists (select 1 from vault.secrets where name = 'paro_webhook_secret') then
    perform vault.create_secret(secret, 'paro_webhook_secret', 'x-webhook-secret for Edge Functions');
  end if;

  drop trigger if exists push_on_follow on public.follows;
  drop trigger if exists push_on_like on public.likes;
  drop trigger if exists push_on_rating on public.prompt_ratings;

  create trigger push_on_follow
    after insert on public.follows
    for each row execute function public.request_push();
  create trigger push_on_like
    after insert on public.likes
    for each row execute function public.request_push();
  create trigger push_on_rating
    after insert on public.prompt_ratings
    for each row execute function public.request_push();
end $$;

-- ---------------------------------------------------------------------------
-- 4. created_at on likes, follows and ratings comes from the database
-- ---------------------------------------------------------------------------

create or replace function public.set_created_at_now()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists set_created_at_now on public.likes;
create trigger set_created_at_now
  before insert on public.likes
  for each row execute function public.set_created_at_now();

drop trigger if exists set_created_at_now on public.follows;
create trigger set_created_at_now
  before insert on public.follows
  for each row execute function public.set_created_at_now();

drop trigger if exists set_created_at_now on public.prompt_ratings;
create trigger set_created_at_now
  before insert or update on public.prompt_ratings
  for each row execute function public.set_created_at_now();

-- ---------------------------------------------------------------------------
-- 5. No views on your own prompt
-- ---------------------------------------------------------------------------

-- As in 20260915120000, with the owner left out like increment_copy_count.
create or replace function public.increment_view_count(prompt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := increment_view_count.prompt_id;
  actor text;
  recent_anonymous integer;
begin
  if not exists (
    select 1 from public.prompts p
     where p.id = target
       and p.user_id is distinct from auth.uid()
  ) then
    return;
  end if;

  actor := public.prompt_counter_actor();

  if actor like 'ip:%' then
    select count(*) into recent_anonymous
      from public.prompt_counter_events e
     where e.prompt_id = target
       and e.kind = 'view'
       and e.actor like 'ip:%'
       and e.counted_at > now() - interval '1 hour';

    if recent_anonymous >= 30 then
      return;
    end if;
  end if;

  if public.claim_prompt_counter(target, 'view', actor, interval '30 minutes') then
    update public.prompts p
       set view_count = p.view_count + 1
     where p.id = target;
  end if;
end;
$$;

commit;
