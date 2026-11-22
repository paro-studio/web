-- CI ONLY. Checks the creator accounts from 20261122000000:
--
--   1. nobody can make themselves a creator, read the record or run the
--      grant and revoke functions, signed in or not
--   2. grants and revokes are recorded with actor and reason, creator_since
--      follows them, and history survives revoke and reinstatement
--   3. posting is unchanged: a non-creator still posts, up to the daily limit
--
-- The checks in 1 and 3 run as the `authenticated` role, so grants and RLS
-- apply as they do for the API. Everything is rolled back.

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
  ('11111111-1111-1111-1111-111111111111', 'someone'),
  ('22222222-2222-2222-2222-222222222222', 'riya');

insert into storage.buckets (id, name, public) values
  ('prompt-images', 'prompt-images', true)
on conflict (id) do nothing;

insert into storage.objects (bucket_id, name) values
  ('prompt-images', '11111111-1111-1111-1111-111111111111/p.jpg');

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

-- 1a. Privileges, for both API roles ------------------------------------------

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_column_privilege(r, 'public.profiles', 'is_creator', 'INSERT')
       or has_column_privilege(r, 'public.profiles', 'is_creator', 'UPDATE')
       or has_column_privilege(r, 'public.profiles', 'creator_since', 'INSERT')
       or has_column_privilege(r, 'public.profiles', 'creator_since', 'UPDATE') then
      raise exception 'is_creator and creator_since must not be writable by %', r;
    end if;

    if has_table_privilege(r, 'public.creator_events', 'SELECT, INSERT, UPDATE, DELETE') then
      raise exception 'public.creator_events must have no privileges for %', r;
    end if;

    if has_function_privilege(r, 'public.grant_creator(text, text, text)', 'EXECUTE')
       or has_function_privilege(r, 'public.revoke_creator(text, text, text)', 'EXECUTE')
       or has_function_privilege(r, 'public.creator_target(text)', 'EXECUTE')
       or has_function_privilege(r, 'public.log_creator_change()', 'EXECUTE') then
      raise exception 'creator functions must not be executable by %', r;
    end if;
  end loop;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'creator_events' and c.relrowsecurity
  ) then
    raise exception 'RLS must be enabled on public.creator_events';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'creator_events') then
    raise exception 'public.creator_events must have no policies';
  end if;
end;
$$;

-- 1b. The same, tried for real as a signed in user ----------------------------

set local role authenticated;

do $$
declare
  me text := '11111111-1111-1111-1111-111111111111';
begin
  perform pg_temp.expect_error(
    format('update public.profiles set is_creator = true where id = %L', me),
    '42501', 'making yourself a creator');
  perform pg_temp.expect_error(
    format('update public.profiles set creator_since = now() where id = %L', me),
    '42501', 'setting your own creator_since');
  perform pg_temp.expect_error(
    $s$select public.grant_creator('someone', 'me', 'me')$s$,
    '42501', 'calling grant_creator');
  perform pg_temp.expect_error(
    $s$select public.revoke_creator('riya', 'no', 'me')$s$,
    '42501', 'calling revoke_creator');
  perform pg_temp.expect_error(
    'select * from public.creator_events',
    '42501', 'reading the creator record');
  perform pg_temp.expect_error(
    format($s$insert into public.creator_events (user_id, action, actor) values (%L, 'grant', 'me')$s$, me),
    '42501', 'writing to the creator record');
end;
$$;

reset role;

-- 2. Grant, revoke and reinstate, as an admin --------------------------------

do $$
declare
  riya uuid := '22222222-2222-2222-2222-222222222222';
  first_since timestamptz;
  row_count integer;
  event record;
begin
  -- Grant, with the @ people tend to type.
  perform public.grant_creator('@Riya', 'Approved from the form', 'akshat');

  select creator_since into first_since from public.profiles where id = riya and is_creator;
  if first_since is null then
    raise exception 'grant_creator must make riya a creator with a creator_since';
  end if;

  select * into event from public.creator_events where user_id = riya;
  if event.action <> 'grant' or event.actor <> 'akshat' or event.reason <> 'Approved from the form' then
    raise exception 'the grant must be recorded with its actor and reason, got %', row_to_json(event);
  end if;

  -- Granting twice is refused, and records nothing.
  perform pg_temp.expect_error($s$select public.grant_creator('riya')$s$, 'P0001', 'granting a creator again');

  -- Other profile edits leave creator_since alone, and cannot fake it.
  update public.profiles set bio = 'hello' where id = riya;
  update public.profiles set creator_since = '2020-01-01' where id = riya;
  if (select creator_since from public.profiles where id = riya) <> first_since then
    raise exception 'creator_since must only move with a grant or revoke';
  end if;

  -- Revoke.
  perform public.revoke_creator('riya', 'Posted spam', 'admin2');
  if (select is_creator or creator_since is not null from public.profiles where id = riya) then
    raise exception 'revoke_creator must clear is_creator and creator_since';
  end if;
  perform pg_temp.expect_error($s$select public.revoke_creator('riya')$s$, 'P0001', 'revoking a non-creator');

  -- A change made straight in the table editor is recorded too, signed by
  -- the connection's user when no actor is given.
  update public.profiles set is_creator = true where id = riya;

  select count(*) into row_count from public.creator_events where user_id = riya;
  if row_count <> 3 then
    raise exception 'grant, revoke and reinstate must leave 3 events, found %', row_count;
  end if;
  if (select array_agg(action order by id) from public.creator_events where user_id = riya)
     <> array['grant', 'revoke', 'grant'] then
    raise exception 'events must be kept in order across reinstatement';
  end if;
  if (select actor from public.creator_events where user_id = riya order by id desc limit 1) <> session_user::text then
    raise exception 'a direct change must be signed by the connection user';
  end if;
  if (select creator_since from public.profiles where id = riya) is null then
    raise exception 'reinstatement must set a new creator_since';
  end if;

  -- Unknown usernames are named in the error.
  perform pg_temp.expect_error($s$select public.grant_creator('nobody_here')$s$, 'P0002', 'granting an unknown username');

  -- The settings used to pass the actor do not leak into later changes.
  if coalesce(current_setting('paro.creator_actor', true), '') <> '' then
    raise exception 'the actor setting must be cleared after a grant or revoke';
  end if;
end;
$$;

-- 3. Posting is unchanged: a non-creator still posts, up to the daily limit ---

set local role authenticated;

do $$
declare
  me  text := '11111111-1111-1111-1111-111111111111';
  img text := 'https://x.supabase.co/storage/v1/object/public/prompt-images/' || me || '/p.jpg';
begin
  if (select is_creator from public.profiles where id = me::uuid) then
    raise exception 'the poster in this test must not be a creator';
  end if;

  for i in 1..3 loop
    insert into public.prompts (user_id, title, prompt, image_url, ai_tool)
    values (me::uuid, 't', 'p', img, 'Midjourney');
  end loop;

  perform pg_temp.expect_error(format(
    $f$insert into public.prompts (user_id, title, prompt, image_url, ai_tool)
       values (%L, 't', 'p', %L, 'Midjourney')$f$, me, img),
    'P0001', 'a fourth upload in one day');
end;
$$;

rollback;
