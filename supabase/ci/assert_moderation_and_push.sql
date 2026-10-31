-- CI ONLY. Acts as a signed in user and checks the rules from
-- 20261021010000:
--
--   1. a prompt's image cannot be swapped by deleting the file and uploading
--      another under the same name, and a prompt can only point at a file
--      that has been uploaded
--   2. changes to a prompt's image or words are limited to 20 a day, and
--      saving without changing anything does not count
--   3. a follow, like or rating asks send-push only when a notification could
--      go out: never for yourself, someone without a phone, someone who has
--      blocked you, or anything already told
--   4. likes get their time from the database, not the client
--   5. an owner adds no views to their own prompt
--   6. a profile photo or banner upload asks moderate-profile-image to check
--      it, and an 11th in a day is refused (20261021020000), including when
--      Storage writes the file over its own connection, with no session and
--      the uploader in owner_id (20261021030000)
--
-- Vault and pg_net exist only on Supabase, so both are stood in for here: the
-- secrets are a table, and net.http_post writes down what it was asked.
-- Everything is in one transaction that is rolled back.

\set ON_ERROR_STOP on

begin;

-- Setup, as the superuser ----------------------------------------------------

create or replace function auth.uid()
returns uuid language sql stable
as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;

grant usage on schema auth, storage to anon, authenticated;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');

insert into public.profiles (id, username) values
  ('11111111-1111-1111-1111-111111111111', 'me_here'),
  ('22222222-2222-2222-2222-222222222222', 'has_a_phone'),
  ('33333333-3333-3333-3333-333333333333', 'no_phone');

insert into storage.buckets (id, name, public) values
  ('prompt-images', 'prompt-images', true),
  ('avatars', 'avatars', true),
  ('banners', 'banners', true)
on conflict (id) do nothing;

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;

insert into storage.objects (bucket_id, name) values
  ('prompt-images', '11111111-1111-1111-1111-111111111111/mine.jpg'),
  ('prompt-images', '22222222-2222-2222-2222-222222222222/theirs.jpg'),
  ('prompt-images', '33333333-3333-3333-3333-333333333333/third.jpg');

insert into public.prompts (id, user_id, title, prompt, image_url, ai_tool) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'mine', 'p',
   'https://x.supabase.co/storage/v1/object/public/prompt-images/11111111-1111-1111-1111-111111111111/mine.jpg', 'Midjourney'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'theirs', 'p',
   'https://x.supabase.co/storage/v1/object/public/prompt-images/22222222-2222-2222-2222-222222222222/theirs.jpg', 'Midjourney'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'theirs too', 'p',
   'https://x.supabase.co/storage/v1/object/public/prompt-images/22222222-2222-2222-2222-222222222222/theirs.jpg', 'Midjourney'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', 'third', 'p',
   'https://x.supabase.co/storage/v1/object/public/prompt-images/33333333-3333-3333-3333-333333333333/third.jpg', 'Midjourney');

-- Only has_a_phone can receive notifications.
insert into public.push_tokens (token, user_id, platform) values
  ('ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]', '22222222-2222-2222-2222-222222222222', 'android');

-- Stand-ins for Vault and pg_net.
create schema if not exists vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets values
  ('paro_functions_url', 'https://x.supabase.co/functions/v1'),
  ('paro_webhook_secret', 'test-secret');

create schema if not exists net;
create table net.calls (url text, body jsonb, headers jsonb);
-- The same parameters as pg_net's, so callers that look it up find it.
create function net.http_post(
  url text,
  body jsonb default '{}',
  params jsonb default '{}',
  headers jsonb default '{}',
  timeout_milliseconds integer default 5000
)
returns bigint language sql as $$
  insert into net.calls values (url, body, headers) returning 1::bigint;
$$;
-- Only so the checks below, run as the user, can count the calls.
grant usage on schema net to authenticated;
grant select on net.calls to authenticated;

-- The triggers the migration creates on Supabase, where hand-made ones exist.
create trigger push_on_follow after insert on public.follows
  for each row execute function public.request_push();
create trigger push_on_like after insert on public.likes
  for each row execute function public.request_push();
create trigger push_on_rating after insert on public.prompt_ratings
  for each row execute function public.request_push();

-- Runs one statement and fails the run unless it errors with the given code.
create function pg_temp.expect_error(stmt text, code text, what text)
returns void language plpgsql as $$
declare
  allowed boolean := false;
begin
  begin
    execute stmt;
    allowed := true;
  exception
    when others then
      if sqlstate <> code then
        raise exception '% was rejected with % (%), expected %', what, sqlstate, sqlerrm, code;
      end if;
  end;

  if allowed then
    raise exception 'expected % to be rejected, but it was allowed', what;
  end if;
end;
$$;

create function pg_temp.expect_calls(expected integer, what text)
returns void language plpgsql as $$
declare
  made integer;
begin
  select count(*) into made from net.calls;
  if made <> expected then
    raise exception 'after %, expected % calls to send-push, got %', what, expected, made;
  end if;
end;
$$;

-- 1 and 2, as the signed in user -----------------------------------------------

set local role authenticated;

do $$
declare
  me    text := '11111111-1111-1111-1111-111111111111';
  store text := 'https://x.supabase.co/storage/v1/object/public/prompt-images/';
  i     integer;
begin
  -- 1. Deleting your own file is allowed; putting another in its place is not.
  delete from storage.objects where bucket_id = 'prompt-images' and name = me || '/mine.jpg';
  perform pg_temp.expect_error(format(
    $f$insert into storage.objects (bucket_id, name) values ('prompt-images', %L)$f$, me || '/mine.jpg'),
    '42501', 'uploading over an image a prompt uses');

  -- A new name is fine, and the prompt can move to it.
  insert into storage.objects (bucket_id, name) values ('prompt-images', me || '/fresh.jpg');
  update public.prompts set image_url = store || me || '/fresh.jpg'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';

  -- A file that was never uploaded is refused, on edit and on posting.
  perform pg_temp.expect_error(format(
    $f$update public.prompts set image_url = %L where id = 'aaaaaaaa-0000-0000-0000-000000000001'$f$,
    store || me || '/missing.jpg'),
    '23514', 'pointing a prompt at a file that does not exist');
  perform pg_temp.expect_error(format(
    $f$insert into public.prompts (user_id, title, prompt, image_url, ai_tool) values (%L, 't', 'p', %L, 'Midjourney')$f$,
    me, store || me || '/missing.jpg'),
    '23514', 'posting a prompt before its image');

  -- 2. One edit so far. Nineteen more reach the limit of twenty.
  for i in 1..19 loop
    update public.prompts set title = 'edit ' || i
     where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  end loop;

  -- Saving without a change still works and is not counted.
  update public.prompts set title = 'edit 19'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';

  perform pg_temp.expect_error(
    $f$update public.prompts set prompt = 'one too many' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$f$,
    'P0001', 'a twenty-first edit in a day');
end;
$$;

-- 3, 4 and 5 ---------------------------------------------------------------------

do $$
declare
  me    uuid := '11111111-1111-1111-1111-111111111111';
  other uuid := '22222222-2222-2222-2222-222222222222';
  stamp timestamptz;
  views integer;
begin
  -- 3. A like on a prompt whose owner has a phone asks for one notification.
  -- 4. And the like is dated now, whatever the client sent.
  insert into public.likes (user_id, prompt_id, created_at)
  values (me, 'aaaaaaaa-0000-0000-0000-000000000002', '2099-01-01');
  perform pg_temp.expect_calls(1, 'a first like');

  select created_at into stamp from public.likes
   where user_id = me and prompt_id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if stamp > now() then
    raise exception 'a like kept the date the client sent: %', stamp;
  end if;

  -- A rating and a follow are their own notifications.
  insert into public.prompt_ratings (user_id, prompt_id, rating)
  values (me, 'aaaaaaaa-0000-0000-0000-000000000002', 5);
  perform pg_temp.expect_calls(2, 'a first rating');
  insert into public.follows (follower_id, following_id) values (me, other);
  perform pg_temp.expect_calls(3, 'a first follow');

  -- Your own prompt, and someone without a phone: nothing to send.
  insert into public.likes (user_id, prompt_id) values (me, 'aaaaaaaa-0000-0000-0000-000000000001');
  insert into public.likes (user_id, prompt_id) values (me, 'aaaaaaaa-0000-0000-0000-000000000004');
  perform pg_temp.expect_calls(3, 'liking your own prompt and one by someone without a phone');

  -- 5. Viewing your own prompt adds nothing.
  perform public.increment_view_count('aaaaaaaa-0000-0000-0000-000000000001');
  select view_count into views from public.prompts where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if views <> 0 then
    raise exception 'an owner added a view to their own prompt';
  end if;
end;
$$;

-- What send-push writes down once it has told someone.
reset role;
insert into public.notification_events (recipient_id, actor_id, kind, prompt_id) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'like', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'follow', null);
set local role authenticated;

do $$
declare
  me    uuid := '11111111-1111-1111-1111-111111111111';
  other uuid := '22222222-2222-2222-2222-222222222222';
  i     integer;
begin
  -- Unliking and liking, unfollowing and following, in a loop: no calls.
  for i in 1..5 loop
    delete from public.likes where user_id = me and prompt_id = 'aaaaaaaa-0000-0000-0000-000000000002';
    insert into public.likes (user_id, prompt_id) values (me, 'aaaaaaaa-0000-0000-0000-000000000002');
    delete from public.follows where follower_id = me and following_id = other;
    insert into public.follows (follower_id, following_id) values (me, other);
  end loop;
  perform pg_temp.expect_calls(3, 'liking and following again in a loop');

  -- A like on their other prompt is quiet too: one was announced just now
  -- for the first prompt, but that window is per prompt, so this one asks.
  insert into public.likes (user_id, prompt_id) values (me, 'aaaaaaaa-0000-0000-0000-000000000003');
  perform pg_temp.expect_calls(4, 'a like on a different prompt');
end;
$$;

-- Once they block you, nothing more is asked for.
reset role;
insert into public.blocks (blocker_id, blocked_id)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');
set local role authenticated;

do $$
begin
  insert into public.prompt_ratings (user_id, prompt_id, rating)
  values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003', 4);
  perform pg_temp.expect_calls(4, 'rating a prompt by someone who blocked you');
end;
$$;

-- The calls that were made went to send-push, with the secret, about a row id.
reset role;
do $$
begin
  if exists (
    select 1 from net.calls
     where url <> 'https://x.supabase.co/functions/v1/send-push'
        or headers ->> 'x-webhook-secret' <> 'test-secret'
        or body ->> 'type' <> 'INSERT'
        or body -> 'record' ->> 'id' is null
  ) then
    raise exception 'a call to send-push was not shaped as it expects';
  end if;
end;
$$;

-- 6. Profile pictures ------------------------------------------------------------

set local role authenticated;

do $$
declare
  me text := '11111111-1111-1111-1111-111111111111';
begin
  insert into storage.objects (bucket_id, name) values ('avatars', me || '/avatar.jpg');

  if not exists (
    select 1 from net.calls
     where url = 'https://x.supabase.co/functions/v1/moderate-profile-image'
       and body ->> 'bucket' = 'avatars'
       and body ->> 'name' = me || '/avatar.jpg'
       and headers ->> 'x-webhook-secret' = 'test-secret'
  ) then
    raise exception 'a new profile photo was not sent to be checked';
  end if;
end;
$$;

-- Nine more today makes ten; the next one is refused.
reset role;
insert into public.profile_image_events (user_id)
select '11111111-1111-1111-1111-111111111111' from generate_series(1, 9);
set local role authenticated;

do $$
begin
  perform pg_temp.expect_error(
    $f$insert into storage.objects (bucket_id, name) values ('banners', '11111111-1111-1111-1111-111111111111/banner.jpg')$f$,
    'P0001', 'an eleventh profile picture in a day');
end;
$$;

-- How Storage really writes: permission checked as the user, then the file
-- written over its own connection, with no session, and the uploader
-- recorded in owner_id.
reset role;
alter table storage.objects add column if not exists owner_id text;
create or replace function auth.uid()
returns uuid language sql stable
as $$ select null::uuid $$;

insert into storage.objects (bucket_id, name, owner_id)
values ('banners', '22222222-2222-2222-2222-222222222222/banner.jpg', '22222222-2222-2222-2222-222222222222');

do $$
begin
  if not exists (
    select 1 from net.calls
     where url = 'https://x.supabase.co/functions/v1/moderate-profile-image'
       and body ->> 'name' = '22222222-2222-2222-2222-222222222222/banner.jpg'
  ) then
    raise exception 'a banner written by Storage itself was not sent to be checked';
  end if;
end;
$$;

-- A file with no owner, as from the dashboard, is left alone.
insert into storage.objects (bucket_id, name)
values ('avatars', '33333333-3333-3333-3333-333333333333/avatar.jpg');

do $$
begin
  if exists (select 1 from net.calls where body ->> 'name' like '33333333-%') then
    raise exception 'a file with no owner was sent to be checked';
  end if;
end;
$$;

rollback;
