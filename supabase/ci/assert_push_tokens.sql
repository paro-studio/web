-- CI ONLY. Checks the rules from 20261009000000 for push notification tokens:
--
--   1. nobody can read or write push_tokens or notification_events directly
--   2. a signed in user can register and remove their own phone, and nothing
--      that is not an Expo push token is accepted
--   3. a phone belongs to whoever signed in on it last, and the previous
--      owner cannot remove it from the new one
--   4. one account cannot hold more than ten
--   5. signed out callers cannot use either function
--
-- Runs as the `authenticated` and `anon` roles so grants and RLS apply.
-- Everything is in one transaction that is rolled back.

\set ON_ERROR_STOP on

begin;

create or replace function auth.uid()
returns uuid language sql stable
as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;

grant usage on schema auth to anon, authenticated;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.profiles (id, username) values
  ('11111111-1111-1111-1111-111111111111', 'push_one'),
  ('22222222-2222-2222-2222-222222222222', 'push_two');

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

-- A stand in for the service role's view of the table, for counting.
create function pg_temp.tokens_of(owner uuid)
returns integer language sql security definer
as $$ select count(*)::integer from public.push_tokens where user_id = owner $$;

-- One of the phones an account currently holds. now() is fixed for the whole
-- transaction, so which ten survive the cap is not predictable here; the
-- tests below ask instead of assuming.
create function pg_temp.a_token_of(owner uuid)
returns text language sql security definer
as $$ select token from public.push_tokens where user_id = owner order by token limit 1 $$;

-- As the first user -------------------------------------------------------------

set local role authenticated;

do $$
declare
  me    uuid := '11111111-1111-1111-1111-111111111111';
  phone text := 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
begin
  -- 1. No direct access to either table.
  perform pg_temp.expect_error('select 1 from public.push_tokens', '42501', 'reading push_tokens');
  perform pg_temp.expect_error(format(
    $f$insert into public.push_tokens (token, user_id, platform) values (%L, %L, 'android')$f$, phone, me),
    '42501', 'inserting into push_tokens directly');
  perform pg_temp.expect_error('select 1 from public.notification_events', '42501', 'reading notification_events');
  perform pg_temp.expect_error(format(
    $f$insert into public.notification_events (recipient_id, actor_id, kind) values (%L, %L, 'follow')$f$, me, me),
    '42501', 'inserting into notification_events directly');

  -- 2. Registering your own phone, twice, is one row.
  perform public.register_push_token(phone, 'android');
  perform public.register_push_token(phone, 'android');
  if pg_temp.tokens_of(me) <> 1 then
    raise exception 'registering the same phone twice must leave one token, found %', pg_temp.tokens_of(me);
  end if;

  perform pg_temp.expect_error(
    $f$select public.register_push_token('not a token', 'android')$f$,
    '23514', 'a token that is not an Expo push token');
  perform pg_temp.expect_error(format(
    $f$select public.register_push_token(%L, 'windows')$f$, phone),
    '23514', 'an unknown platform');

  -- 4. Ten at most: the eleventh pushes the oldest out.
  for i in 1..11 loop
    perform public.register_push_token(format('ExponentPushToken[bbbbbbbbbbbbbbbbbbbb%s]', lpad(i::text, 2, '0')), 'android');
  end loop;
  if pg_temp.tokens_of(me) <> 10 then
    raise exception 'one account must hold ten tokens at most, found %', pg_temp.tokens_of(me);
  end if;
end;
$$;

-- As the second user, on the first user's phone ----------------------------------

reset role;

create or replace function auth.uid()
returns uuid language sql stable
as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;

set local role authenticated;

do $$
declare
  one   uuid := '11111111-1111-1111-1111-111111111111';
  two   uuid := '22222222-2222-2222-2222-222222222222';
  phone text := pg_temp.a_token_of('11111111-1111-1111-1111-111111111111');
begin
  -- 3. Signing in on that phone takes its token over.
  perform public.register_push_token(phone, 'android');
  if pg_temp.tokens_of(two) <> 1 or pg_temp.tokens_of(one) <> 9 then
    raise exception 'the phone must move to the new account, found % and %',
      pg_temp.tokens_of(two), pg_temp.tokens_of(one);
  end if;
end;
$$;

-- The first user cannot take it back off the second.

reset role;

create or replace function auth.uid()
returns uuid language sql stable
as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;

set local role authenticated;

do $$
declare
  one uuid := '11111111-1111-1111-1111-111111111111';
  two uuid := '22222222-2222-2222-2222-222222222222';
begin
  perform public.unregister_push_token(pg_temp.a_token_of(two));
  if pg_temp.tokens_of(two) <> 1 then
    raise exception 'unregistering must only remove your own token';
  end if;

  -- Your own does go.
  perform public.unregister_push_token(pg_temp.a_token_of(one));
  if pg_temp.tokens_of(one) <> 8 then
    raise exception 'unregistering your own phone must remove it';
  end if;
end;
$$;

-- 5. Signed out ------------------------------------------------------------------

reset role;

create or replace function auth.uid()
returns uuid language sql stable
as $$ select null::uuid $$;

set local role anon;

do $$
begin
  perform pg_temp.expect_error(
    $f$select public.register_push_token('ExponentPushToken[cccccccccccccccccccccc]', 'android')$f$,
    '42501', 'registering a phone while signed out');
  perform pg_temp.expect_error(
    $f$select public.unregister_push_token('ExponentPushToken[cccccccccccccccccccccc]')$f$,
    '42501', 'removing a phone while signed out');
end;
$$;

reset role;

rollback;
