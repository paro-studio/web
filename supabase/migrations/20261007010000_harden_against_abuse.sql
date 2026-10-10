-- Close the holes an adversarial review found on 2026-10-07.
--
-- Everyone has the anon key, and anyone can make an account with Google, so
-- the only real limits are the ones the database enforces. Each of these was
-- a rule that existed in the apps but could be skipped by calling the API
-- directly:
--
--   1. The 3 prompts a day limit did not hold for a bulk insert. The check ran
--      BEFORE each row and counted prompt_uploads, which is only written AFTER
--      the whole statement, so every row of one request saw the same old
--      count. One request with 1,000 rows posted 1,000 prompts.
--   2. A rating could be moved to another prompt. The counter trigger only
--      recomputed the prompt it landed on, so one account could leave any
--      prompt showing hundreds of ratings, or strip another's count to zero.
--   3. Feedback and reports had no limit. Each row also sends a Discord
--      message now, so a flood would have buried real reports and filled the
--      database.
--   4. Prompt images could be uploaded into subfolders. Account deletion only
--      clears the top level, so those files outlived the account, and with it
--      the upload allowance that was meant to cap them.
--   5. Anyone, signed out, could list every folder in the avatars and banners
--      buckets. Public buckets serve files by address without a read policy;
--      the policy only enabled listing.
--   6. Titles, prompt text, the AI tool and tags had no size limit outside the
--      forms. One multi megabyte title would have ridden along in every feed
--      page.
--   7. Names like "admin" and "support" could be taken by anyone, and an
--      account could post without ever choosing a username.
--
-- Every limit below sits above what the apps allow, so nobody using Paro
-- normally meets one. Checked against production on 2026-10-07: the longest
-- title is 26 characters, the most tags 8, and the only reserved name in use
-- is the verified parostudio account.
--
-- One transaction. If any existing row breaks a new rule the whole migration
-- fails and changes nothing, which is the point: a check added NOT VALID
-- would still be enforced on every later update of the old row, including
-- the counter triggers, and would break likes and views on that prompt.

begin;

-- ---------------------------------------------------------------------------
-- 1. The daily upload limit, for any number of rows
-- ---------------------------------------------------------------------------

-- Still checked before the insert, so the common case fails early with the
-- same message. Also the place a missing username is caught.
create or replace function public.check_prompt_upload_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  poster record;
  daily_upload_count integer;
  day_start timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('prompt_upload:' || new.user_id::text));

  select coalesce(verified, false) as verified, username into poster
  from public.profiles
  where id = new.user_id;

  if poster.username is null then
    raise exception 'Choose a username before posting.'
      using errcode = '23514';
  end if;

  if poster.verified then
    return new;
  end if;

  day_start := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';

  select count(*) into daily_upload_count
  from public.prompt_uploads
  where user_id = new.user_id
    and created_at >= day_start;

  if daily_upload_count >= 3 then
    raise exception 'Daily prompt upload limit reached for unverified accounts (3 per day). Limit resets at midnight UTC.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- And again after, where it counts. AFTER ROW triggers run one by one once
-- the statement's rows are all in, and each sees the uploads logged by the
-- ones before it. The fourth raises, and that undoes the whole statement.
create or replace function public.log_prompt_upload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  perform pg_advisory_xact_lock(hashtext('prompt_upload:' || new.user_id::text));

  insert into public.prompt_uploads (user_id, prompt_id, created_at)
  values (new.user_id, new.id, now());

  if not coalesce((select verified from public.profiles where id = new.user_id), false)
     and (select count(*)
            from public.prompt_uploads
           where user_id = new.user_id
             and created_at >= day_start) > 3 then
    raise exception 'Daily prompt upload limit reached for unverified accounts (3 per day). Limit resets at midnight UTC.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Ratings stay on the prompt and the user they were given for
-- ---------------------------------------------------------------------------

-- A trigger rather than a column grant: both apps save a rating with an
-- upsert, which names every column in its update, so limiting UPDATE to the
-- rating column would break them. Writing the same prompt and user back is
-- fine; changing either is not.
create or replace function public.keep_rating_target()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.prompt_id is distinct from old.prompt_id
     or new.user_id is distinct from old.user_id then
    raise exception 'A rating cannot be moved to another prompt or user.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists keep_rating_target on public.prompt_ratings;
create trigger keep_rating_target
  before update on public.prompt_ratings
  for each row execute function public.keep_rating_target();

-- The count is recounted from the rows each time instead of being stepped up
-- and down, so it cannot drift from the truth whatever happens to a row.
create or replace function public.handle_prompt_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := case when tg_op = 'DELETE' then old.prompt_id else new.prompt_id end;
begin
  update public.prompts
  set
    rating_count = (select count(*) from public.prompt_ratings where prompt_id = target),
    rating_average = (select round(avg(rating)::numeric, 2) from public.prompt_ratings where prompt_id = target)
  where id = target;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Put right anything that has already drifted.
update public.prompts p
set rating_count = coalesce((select count(*) from public.prompt_ratings pr where pr.prompt_id = p.id), 0),
    rating_average = (select round(avg(rating)::numeric, 2) from public.prompt_ratings pr where pr.prompt_id = p.id)
where p.rating_count is distinct from coalesce((select count(*) from public.prompt_ratings pr where pr.prompt_id = p.id), 0)
   or p.rating_average is distinct from (select round(avg(rating)::numeric, 2) from public.prompt_ratings pr where pr.prompt_id = p.id);

-- ---------------------------------------------------------------------------
-- 3. A daily limit on feedback and reports
-- ---------------------------------------------------------------------------

-- One function for all three tables; the limit is the trigger's argument.
-- Counted over the last 24 hours per user. Rows from earlier in the same
-- statement are visible to a BEFORE ROW trigger, so a bulk insert is caught
-- row by row. created_at is set here as well: these tables still let a
-- client send it, and a backdated row would otherwise fall outside the count.
create or replace function public.limit_daily_submissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  daily_limit integer := tg_argv[0]::integer;
  sent integer;
begin
  new.created_at := now();

  perform pg_advisory_xact_lock(hashtext(tg_table_name || ':' || new.user_id::text));

  execute format(
    'select count(*) from public.%I where user_id = $1 and created_at >= now() - interval ''24 hours''',
    tg_table_name
  ) into sent using new.user_id;

  if sent >= daily_limit then
    raise exception 'Daily limit reached. Try again tomorrow.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists limit_daily_feedback on public.feedback;
create trigger limit_daily_feedback
  before insert on public.feedback
  for each row execute function public.limit_daily_submissions('5');

drop trigger if exists limit_daily_prompt_reports on public.prompt_reports;
create trigger limit_daily_prompt_reports
  before insert on public.prompt_reports
  for each row execute function public.limit_daily_submissions('30');

drop trigger if exists limit_daily_user_reports on public.user_reports;
create trigger limit_daily_user_reports
  before insert on public.user_reports
  for each row execute function public.limit_daily_submissions('15');

-- ---------------------------------------------------------------------------
-- 4. Prompt images sit directly in the user's folder, never deeper
-- ---------------------------------------------------------------------------

drop policy if exists "Users can upload own prompt images" on storage.objects;
create policy "Users can upload own prompt images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'prompt-images'
    and name ~ ('^' || (auth.uid())::text || '/[^/]+$')
    and public.prompt_image_quota_ok()
  );

-- ---------------------------------------------------------------------------
-- 5. No listing other people's avatars and banners
-- ---------------------------------------------------------------------------

-- Reading your own is kept: replacing a file with upsert needs to see it.
drop policy if exists "Public read avatars" on storage.objects;
drop policy if exists "Users can view own avatar" on storage.objects;
create policy "Users can view own avatar"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Public read banners" on storage.objects;
drop policy if exists "Users can view own banner" on storage.objects;
create policy "Users can view own banner"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'banners'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- ---------------------------------------------------------------------------
-- 6. Size limits on a prompt's fields
-- ---------------------------------------------------------------------------

-- The forms allow a 100 character title and 3 to 8 tags. immutable_array_to_string
-- is the wrapper added for the search index; array_to_string itself is not
-- allowed in a check.
alter table public.prompts
  add constraint prompts_title_length
    check (char_length(title) <= 150),
  add constraint prompts_prompt_length
    check (prompt is null or char_length(prompt) <= 20000),
  add constraint prompts_ai_tool_length
    check (char_length(ai_tool) <= 60),
  add constraint prompts_tags_shape
    check (
      tags is null
      or (cardinality(tags) <= 12
          and char_length(public.immutable_array_to_string(tags, '')) <= 400)
    );

-- ---------------------------------------------------------------------------
-- 7. Names that read as official are for verified accounts only
-- ---------------------------------------------------------------------------

alter table public.profiles
  add constraint profiles_username_not_reserved
    check (
      coalesce(verified, false)
      or username is null
      or username not in (
        'admin', 'administrator', 'paro', 'parostudio', 'parostudios',
        'paro_studio', 'paro_studios', 'paro_official', 'official', 'support',
        'help', 'moderator', 'mod', 'staff', 'team', 'security', 'root',
        'system', 'null', 'undefined'
      )
    );

commit;

-- Verification, signed in as an unverified user with a username:
--
--   insert four prompts in ONE request (a JSON array)      -> P0001, none saved
--   update prompt_ratings set prompt_id = <another>         -> 42501
--   insert six feedback rows in a day                       -> sixth is P0001
--   upload to prompt-images/<uid>/sub/file.jpg              -> 42501
--   update profiles set username = 'admin'                  -> 23514
--   insert a prompt with a 200 character title              -> 23514
--
-- Signed out:
--   POST /storage/v1/object/list/avatars                    -> []
