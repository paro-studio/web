-- CI ONLY. Acts as a signed in user and checks that the limits from
-- 20261007010000 cannot be walked around by calling the API directly:
--
--   1. the daily upload limit holds for a bulk insert, and posting needs a
--      username
--   2. a rating cannot be moved to another prompt, and the count stays true
--   3. feedback and reports have a daily limit that a bulk insert or a
--      backdated row does not dodge
--   4. prompt images cannot go in subfolders, and other people's avatars and
--      banners cannot be listed
--   5. a prompt's fields have size limits
--   6. reserved usernames need a verified account
--
-- Runs as the `authenticated` role so grants and RLS apply, which they do not
-- for the superuser CI connects as. Everything is in one transaction that is
-- rolled back.

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
  ('11111111-1111-1111-1111-111111111111', 'abuse_limits'),
  ('22222222-2222-2222-2222-222222222222', 'someone_else'),
  ('33333333-3333-3333-3333-333333333333', null);

insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('banners', 'banners', true),
  ('prompt-images', 'prompt-images', true)
on conflict (id) do nothing;

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated;

-- Two prompts by someone else to rate and report, and their avatar.
insert into public.prompts (id, user_id, title, prompt, image_url, ai_tool) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'one', 'p',
   'https://x.supabase.co/storage/v1/object/public/prompt-images/22222222-2222-2222-2222-222222222222/a.jpg', 'Midjourney'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'two', 'p',
   'https://x.supabase.co/storage/v1/object/public/prompt-images/22222222-2222-2222-2222-222222222222/b.jpg', 'Midjourney');

insert into storage.objects (bucket_id, name) values
  ('avatars', '22222222-2222-2222-2222-222222222222/avatar.jpg'),
  ('banners', '22222222-2222-2222-2222-222222222222/banner.jpg');

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

-- From here on, act as the signed in user ------------------------------------

set local role authenticated;

do $$
declare
  me     text := '11111111-1111-1111-1111-111111111111';
  other  text := '22222222-2222-2222-2222-222222222222';
  img    text := 'https://x.supabase.co/storage/v1/object/public/prompt-images/' || me || '/p.jpg';
  one    text := 'aaaaaaaa-0000-0000-0000-000000000001';
  two    text := 'aaaaaaaa-0000-0000-0000-000000000002';
  n      integer;
  r      record;
begin
  -- 1. Four prompts in one statement is still four prompts --------------------
  perform pg_temp.expect_error(format(
    $f$insert into public.prompts (user_id, title, prompt, image_url, ai_tool)
       select %L, 't' || i, 'p', %L, 'Midjourney' from generate_series(1, 4) i$f$, me, img),
    'P0001', 'four uploads in one statement');

  select count(*) into n from public.prompts where user_id = me::uuid;
  if n <> 0 then
    raise exception 'a rejected bulk upload must save nothing, % rows were kept', n;
  end if;

  -- Three in one statement is within the limit, and a fourth after is not.
  insert into public.prompts (user_id, title, prompt, image_url, ai_tool)
  select me::uuid, 't' || i, 'p', img, 'Midjourney' from generate_series(1, 3) i;

  perform pg_temp.expect_error(format(
    $f$insert into public.prompts (user_id, title, prompt, image_url, ai_tool)
       values (%L, 't', 'p', %L, 'Midjourney')$f$, me, img),
    'P0001', 'a fourth upload after three in bulk');

  -- 2. A rating stays where it was given --------------------------------------
  insert into public.prompt_ratings (user_id, prompt_id, rating) values (me::uuid, one::uuid, 5);

  perform pg_temp.expect_error(format(
    $f$update public.prompt_ratings set prompt_id = %L where user_id = %L$f$, two, me),
    '42501', 'moving a rating to another prompt');

  -- Changing the stars, the way both apps do with an upsert, still works.
  insert into public.prompt_ratings (user_id, prompt_id, rating) values (me::uuid, one::uuid, 3)
  on conflict (user_id, prompt_id) do update
    set user_id = excluded.user_id, prompt_id = excluded.prompt_id, rating = excluded.rating;

  select rating_count, rating_average into r from public.prompts where id = one::uuid;
  if r.rating_count <> 1 or r.rating_average <> 3 then
    raise exception 'after one rating changed to 3, expected count 1 average 3, got % and %',
      r.rating_count, r.rating_average;
  end if;

  delete from public.prompt_ratings where user_id = me::uuid;
  select rating_count, rating_average into r from public.prompts where id = one::uuid;
  if r.rating_count <> 0 or r.rating_average is not null then
    raise exception 'after the rating was removed, expected count 0 and no average, got % and %',
      r.rating_count, r.rating_average;
  end if;

  -- 3. Feedback and reports are limited per day --------------------------------
  perform pg_temp.expect_error(format(
    $f$insert into public.feedback (user_id, subject, message)
       select %L, 's', 'm' from generate_series(1, 6)$f$, me),
    'P0001', 'six feedback rows in one statement');

  insert into public.feedback (user_id, subject, message)
  select me::uuid, 's', 'm' from generate_series(1, 5);

  -- Backdating does not make room: the database sets the time.
  perform pg_temp.expect_error(format(
    $f$insert into public.feedback (user_id, subject, message, created_at)
       values (%L, 's', 'm', '2020-01-01T00:00:00Z')$f$, me),
    'P0001', 'a sixth, backdated feedback row');

  -- Reports within the limit still work, and so does "already reported".
  insert into public.prompt_reports (user_id, prompt_id, reason) values (me::uuid, one::uuid, 'impersonation');
  perform pg_temp.expect_error(format(
    $f$insert into public.prompt_reports (user_id, prompt_id, reason) values (%L, %L, 'spam')$f$, me, one),
    '23505', 'reporting the same prompt twice');

  insert into public.user_reports (user_id, reported_id, reason) values (me::uuid, other::uuid, 'spam');

  -- 4. Storage -----------------------------------------------------------------
  insert into storage.objects (bucket_id, name) values ('prompt-images', me || '/ok.jpg');

  perform pg_temp.expect_error(format(
    $f$insert into storage.objects (bucket_id, name) values ('prompt-images', %L)$f$, me || '/sub/hidden.jpg'),
    '42501', 'a prompt image in a subfolder');

  insert into storage.objects (bucket_id, name) values ('avatars', me || '/avatar.jpg');

  select count(*) into n from storage.objects where bucket_id in ('avatars', 'banners');
  if n <> 1 then
    raise exception 'a signed in user must see only their own avatar and banner, saw % files', n;
  end if;

  -- 5. Size limits ---------------------------------------------------------------
  perform pg_temp.expect_error(format(
    $f$update public.prompts set title = repeat('x', 151) where user_id = %L$f$, me),
    '23514', 'a 151 character title');
  perform pg_temp.expect_error(format(
    $f$update public.prompts set ai_tool = repeat('x', 61) where user_id = %L$f$, me),
    '23514', 'a 61 character AI tool');
  perform pg_temp.expect_error(format(
    $f$update public.prompts set tags = array(select 't' || i from generate_series(1, 13) i) where user_id = %L$f$, me),
    '23514', 'thirteen tags');
  perform pg_temp.expect_error(format(
    $f$update public.prompts set prompt = repeat('x', 20001) where user_id = %L$f$, me),
    '23514', 'a 20,001 character prompt');

  -- What the forms allow still fits.
  update public.prompts
     set title = repeat('x', 100), tags = array['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
   where user_id = me::uuid;

  -- 6. Reserved usernames ----------------------------------------------------------
  perform pg_temp.expect_error(format(
    $f$update public.profiles set username = 'admin' where id = %L$f$, me),
    '23514', 'taking the username admin');
  perform pg_temp.expect_error(format(
    $f$update public.profiles set username = 'parostudio' where id = %L$f$, me),
    '23514', 'taking the username parostudio');
end;
$$;

-- Signed out, the avatar and banner buckets list nothing ------------------------

set local role anon;

do $$
declare
  n integer;
begin
  select count(*) into n from storage.objects where bucket_id in ('avatars', 'banners');
  if n <> 0 then
    raise exception 'signed out, avatars and banners must not be listable, saw % files', n;
  end if;
end;
$$;

-- An account that never chose a username cannot post -----------------------------

reset role;

create or replace function auth.uid()
returns uuid language sql stable
as $$ select '33333333-3333-3333-3333-333333333333'::uuid $$;

set local role authenticated;

do $$
declare
  nameless text := '33333333-3333-3333-3333-333333333333';
begin
  perform pg_temp.expect_error(format(
    $f$insert into public.prompts (user_id, title, prompt, image_url, ai_tool)
       values (%L, 't', 'p', %L, 'Midjourney')$f$,
    nameless,
    'https://x.supabase.co/storage/v1/object/public/prompt-images/' || nameless || '/p.jpg'),
    '23514', 'posting without a username');
end;
$$;

-- A verified account may hold a reserved name ------------------------------------

reset role;

do $$
begin
  update public.profiles set verified = true, username = 'parostudio'
   where id = '22222222-2222-2222-2222-222222222222';
end;
$$;

-- 20261007020000: honest counts and our own storage -------------------------------

create or replace function auth.uid()
returns uuid language sql stable
as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;

set local role authenticated;

do $$
declare
  me    text := '11111111-1111-1111-1111-111111111111';
  one   uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  mine  uuid;
  n     integer;
begin
  select id into mine from public.prompts where user_id = me::uuid limit 1;

  -- No rating your own prompt, by insert or by the apps' upsert.
  perform pg_temp.expect_error(format(
    $f$insert into public.prompt_ratings (user_id, prompt_id, rating) values (%L, %L, 5)$f$, me, mine),
    '23514', 'rating your own prompt');
  perform pg_temp.expect_error(format(
    $f$insert into public.prompt_ratings (user_id, prompt_id, rating) values (%L, %L, 5)
       on conflict (user_id, prompt_id) do update set rating = excluded.rating$f$, me, mine),
    '23514', 'rating your own prompt with an upsert');

  -- Copying your own prompt does not count. Someone else's does.
  perform public.increment_copy_count(mine);
  select copy_count into n from public.prompts where id = mine;
  if n <> 0 then
    raise exception 'copying your own prompt must not count, copy_count is %', n;
  end if;

  perform public.increment_copy_count(one);
  select copy_count into n from public.prompts where id = one;
  if n <> 1 then
    raise exception 'copying someone else''s prompt must count once, copy_count is %', n;
  end if;
end;
$$;

-- Signed out views: the caller's own x-forwarded-for entries are ignored.

reset role;

create or replace function auth.uid()
returns uuid language sql stable
as $$ select null::uuid $$;

set local role anon;

do $$
declare
  two uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  n   integer;
begin
  -- Two made up addresses in front of the same real one are one visitor.
  perform set_config('request.headers', '{"x-forwarded-for": "1.1.1.1, 203.0.113.9"}', true);
  perform public.increment_view_count(two);
  perform set_config('request.headers', '{"x-forwarded-for": "2.2.2.2, 203.0.113.9"}', true);
  perform public.increment_view_count(two);

  select view_count into n from public.prompts where id = two;
  if n <> 1 then
    raise exception 'a spoofed x-forwarded-for must not add views, view_count is %', n;
  end if;

  -- cf-connecting-ip wins over anything in x-forwarded-for.
  perform set_config('request.headers',
    '{"cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "3.3.3.3, 203.0.113.50"}', true);
  perform public.increment_view_count(two);
  perform set_config('request.headers',
    '{"cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "4.4.4.4, 203.0.113.51"}', true);
  perform public.increment_view_count(two);

  select view_count into n from public.prompts where id = two;
  if n <> 2 then
    raise exception 'one real visitor behind cf-connecting-ip must count once, view_count is %', n;
  end if;
end;
$$;

-- Once the project's storage host is set, other hosts are refused.

reset role;

insert into public.app_config (key, value) values ('storage_host', 'ours.supabase.co');

create or replace function auth.uid()
returns uuid language sql stable
as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;

set local role authenticated;

do $$
declare
  me   text := '11111111-1111-1111-1111-111111111111';
  path text := '/storage/v1/object/public/';
begin
  perform pg_temp.expect_error(format(
    $f$update public.prompts set image_url = %L where user_id = %L$f$,
    'https://theirs.supabase.co' || path || 'prompt-images/' || me || '/x.jpg', me),
    '23514', 'a prompt image on another project');
  -- A dot in our host must not match any character.
  perform pg_temp.expect_error(format(
    $f$update public.prompts set image_url = %L where user_id = %L$f$,
    'https://oursxsupabase.co' || path || 'prompt-images/' || me || '/x.jpg', me),
    '23514', 'a prompt image on a lookalike host');
  perform pg_temp.expect_error(format(
    $f$update public.profiles set avatar_url = %L where id = %L$f$,
    'https://theirs.supabase.co' || path || 'avatars/' || me || '/avatar.jpg', me),
    '23514', 'an avatar on another project');
  perform pg_temp.expect_error(format(
    $f$update public.profiles set cover_url = %L where id = %L$f$,
    'https://theirs.supabase.co' || path || 'banners/' || me || '/banner.jpg', me),
    '23514', 'a banner on another project');

  -- Our own host, and a Google photo from first sign in, still work.
  update public.prompts
     set image_url = 'https://ours.supabase.co' || path || 'prompt-images/' || me || '/x.jpg'
   where user_id = me::uuid;
  update public.profiles
     set avatar_url = 'https://ours.supabase.co' || path || 'avatars/' || me || '/avatar.jpg?v=1',
         cover_url  = 'https://ours.supabase.co' || path || 'banners/' || me || '/banner.jpg?v=1'
   where id = me::uuid;
  update public.profiles
     set avatar_url = 'https://lh3.googleusercontent.com/a/photo'
   where id = me::uuid;
end;
$$;

reset role;

rollback;
