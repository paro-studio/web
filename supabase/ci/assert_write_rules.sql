-- CI ONLY. Acts as a signed in user and checks the write rules from
-- 20260922120000, 20260922120100, 20260922120200 and 20260922140000 actually
-- hold:
--
--   1. created_at cannot be set by clients, the daily upload limit cannot be
--      dodged by backdating, and prompt images must be in our storage
--   2. profile fields follow the same rules as the forms
--   3. storage uploads are limited by file name and, for prompt images, count
--
-- Runs as the `authenticated` role so grants and RLS apply, which they do not
-- for the superuser CI connects as. Everything is in one transaction that is
-- rolled back, including the stand in auth.uid() and turning RLS on for the
-- storage.objects stub.

\set ON_ERROR_STOP on

begin;

-- Setup, as the superuser ----------------------------------------------------

create or replace function auth.uid()
returns uuid language sql stable
as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;

grant usage on schema auth, storage to anon, authenticated;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.profiles (id, username) values
  ('11111111-1111-1111-1111-111111111111', 'write_rules'),
  ('22222222-2222-2222-2222-222222222222', 'someone_else');

insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('banners', 'banners', true),
  ('prompt-images', 'prompt-images', true)
on conflict (id) do nothing;

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;

-- Runs one statement and fails the run unless it errors with the given code.
-- The "allowed" check sits outside the inner block, so it cannot be mistaken for
-- the expected error when the expected code is P0001, which raise also uses.
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

-- 1a. created_at is not insertable ---------------------------------------------

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_column_privilege(r, 'public.prompts', 'created_at', 'INSERT') then
      raise exception 'prompts.created_at must not be insertable by %', r;
    end if;
    if has_column_privilege(r, 'public.profiles', 'created_at', 'INSERT') then
      raise exception 'profiles.created_at must not be insertable by %', r;
    end if;
  end loop;
end;
$$;

-- 1b. A backdated row is still logged as today ---------------------------------
-- Done as the superuser, which can set created_at, to prove the log ignores it.

do $$
declare
  logged timestamptz;
begin
  insert into public.prompts (user_id, title, prompt, image_url, ai_tool, created_at)
  values ('22222222-2222-2222-2222-222222222222', 'old', 'p',
          'https://x.supabase.co/storage/v1/object/public/prompt-images/22222222-2222-2222-2222-222222222222/a.jpg',
          'Midjourney', '2020-01-01T00:00:00Z');

  select created_at into logged
    from public.prompt_uploads
   where user_id = '22222222-2222-2222-2222-222222222222';

  if logged <> now() then
    raise exception 'upload log must use the real time, got %', logged;
  end if;
end;
$$;

-- From here on, act as the signed in user ----------------------------------

set local role authenticated;

do $$
declare
  me     text := '11111111-1111-1111-1111-111111111111';
  other  text := '22222222-2222-2222-2222-222222222222';
  img    text := 'https://x.supabase.co/storage/v1/object/public/prompt-images/' || me || '/p.jpg';
  store  text := 'https://abc-123.supabase.co/storage/v1/object/public/';
begin
  -- 1c. Clients cannot set created_at, and the limit still applies -----------
  perform pg_temp.expect_error(format(
    $f$insert into public.prompts (user_id, title, prompt, image_url, ai_tool, created_at)
       values (%L, 't', 'p', %L, 'Midjourney', '2020-01-01T00:00:00Z')$f$, me, img),
    '42501', 'a client supplied created_at');

  for i in 1..3 loop
    insert into public.prompts (user_id, title, prompt, image_url, ai_tool)
    values (me::uuid, 't', 'p', img, 'Midjourney');
  end loop;

  perform pg_temp.expect_error(format(
    $f$insert into public.prompts (user_id, title, prompt, image_url, ai_tool)
       values (%L, 't', 'p', %L, 'Midjourney')$f$, me, img),
    'P0001', 'a fourth upload in one day');

  -- 1d. Prompt images must come from the uploader's own storage folder --------
  perform pg_temp.expect_error(format(
    $f$insert into public.prompts (user_id, title, prompt, image_url, ai_tool)
       values (%L, 't', 'p', 'https://evil.example/pixel.gif', 'Midjourney')$f$, me),
    '23514', 'a new prompt with an image on another server');
  perform pg_temp.expect_error(format(
    $f$update public.prompts set image_url = 'https://evil.example/pixel.gif' where user_id = %L$f$, me),
    '23514', 'a prompt image on another server');
  perform pg_temp.expect_error(format(
    $f$update public.prompts set image_url = %L where user_id = %L$f$,
    store || 'prompt-images/' || other || '/a.jpg', me),
    '23514', 'a prompt image in someone else''s folder');
  perform pg_temp.expect_error(format(
    $f$update public.prompts set image_url = %L where user_id = %L$f$,
    store || 'prompt-images/' || me || '/a/b.jpg', me),
    '23514', 'a prompt image in a subfolder');
  update public.prompts set image_url = store || 'prompt-images/' || me || '/new.webp' where user_id = me::uuid;

  -- 2. Profile fields ---------------------------------------------------------
  perform pg_temp.expect_error(format($f$update public.profiles set username = 'Write_rules' where id = %L$f$, me),
    '23514', 'a username with a capital');
  perform pg_temp.expect_error(format($f$update public.profiles set username = 'write_rules ' where id = %L$f$, me),
    '23514', 'a username with a trailing space');
  perform pg_temp.expect_error(format($f$update public.profiles set username = 'wr' || chr(1110) || 'te_rules' where id = %L$f$, me),
    '23514', 'a username with a Cyrillic letter');
  perform pg_temp.expect_error(format($f$update public.profiles set username = 'ab' where id = %L$f$, me),
    '23514', 'a two character username');
  update public.profiles set username = 'write_rules_2' where id = me::uuid;

  perform pg_temp.expect_error(format($f$update public.profiles set avatar_url = 'https://evil.example/pixel.gif' where id = %L$f$, me),
    '23514', 'an avatar on another server');
  perform pg_temp.expect_error(format($f$update public.profiles set avatar_url = %L where id = %L$f$,
    store || 'avatars/' || other || '/avatar.jpg', me),
    '23514', 'an avatar in someone else''s folder');
  update public.profiles set avatar_url = store || 'avatars/' || me || '/avatar.jpg?v=1758542400000' where id = me::uuid;
  update public.profiles set avatar_url = 'https://lh3.googleusercontent.com/a/abc=s96-c' where id = me::uuid;

  perform pg_temp.expect_error(format($f$update public.profiles set cover_url = 'https://lh3.googleusercontent.com/a/abc' where id = %L$f$, me),
    '23514', 'a banner on another server');
  update public.profiles set cover_url = store || 'banners/' || me || '/banner.jpg?v=1' where id = me::uuid;

  perform pg_temp.expect_error(format($f$update public.profiles set website = 'javascript:alert(1)' where id = %L$f$, me),
    '23514', 'a javascript: website');
  update public.profiles set website = 'https://example.com' where id = me::uuid;

  perform pg_temp.expect_error(format($f$update public.profiles set bio = repeat('a', 501) where id = %L$f$, me),
    '23514', 'a 501 character bio');
  perform pg_temp.expect_error(format($f$update public.profiles set full_name = repeat('a', 101) where id = %L$f$, me),
    '23514', 'a 101 character name');

  -- 3. Storage ----------------------------------------------------------------
  insert into storage.objects (bucket_id, name) values ('avatars', me || '/avatar.jpg');
  insert into storage.objects (bucket_id, name) values ('banners', me || '/banner.jpg');

  perform pg_temp.expect_error(format($f$insert into storage.objects (bucket_id, name) values ('avatars', %L)$f$, me || '/junk.png'),
    '42501', 'an extra file in avatars');
  perform pg_temp.expect_error(format($f$insert into storage.objects (bucket_id, name) values ('banners', %L)$f$, me || '/junk.png'),
    '42501', 'an extra file in banners');
  perform pg_temp.expect_error(format($f$insert into storage.objects (bucket_id, name) values ('avatars', %L)$f$, other || '/avatar.jpg'),
    '42501', 'an avatar in someone else''s folder');
  perform pg_temp.expect_error(format($f$update storage.objects set name = %L where bucket_id = 'avatars' and name = %L$f$,
    me || '/renamed.png', me || '/avatar.jpg'),
    '42501', 'renaming the avatar to another file name');

  -- Three prompts so far, so three plus five files are allowed.
  for i in 1..8 loop
    insert into storage.objects (bucket_id, name) values ('prompt-images', me || '/' || i || '.jpg');
  end loop;
  perform pg_temp.expect_error(format($f$insert into storage.objects (bucket_id, name) values ('prompt-images', %L)$f$, me || '/9.jpg'),
    '42501', 'a ninth prompt image with three prompts');
end;
$$;

rollback;
