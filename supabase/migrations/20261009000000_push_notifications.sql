-- Push notifications for the mobile app: where to send them, and a record of
-- what was sent.
--
-- The app tells people when someone follows them, likes one of their prompts,
-- or when a creator they follow posts. Sending is done by the send-push Edge
-- Function, with the service role. This migration gives it two tables.
--
-- push_tokens          One row per phone: the address Expo's push service
--                      delivers to, and whose phone it is right now. Nobody
--                      can read or write it through the API. A token is as
--                      good as the ability to put a message on someone's lock
--                      screen, so the app can only hand its own over, through
--                      register_push_token(), and take it back with
--                      unregister_push_token().
--
-- notification_events  What was sent to whom, and about what. Kept so the
--                      sender can avoid repeating itself: liking, unliking
--                      and liking again must not buzz someone three times.
--                      Service only, like push_tokens.
--
-- A phone belongs to whoever is signed in on it. When a second account signs
-- in on the same phone, the token moves to that account, so the first
-- person's notifications stop arriving there. Signing out removes it.
--
-- Both tables point at public.profiles (id) and delete with it, as every
-- table has since 20260907000000, so deleting an account removes its tokens
-- and its history in both directions.

begin;

-- ---------------------------------------------------------------------------
-- push_tokens
-- ---------------------------------------------------------------------------

create table if not exists public.push_tokens (
  token        text        primary key,
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  platform     text        not null check (platform in ('android', 'ios')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- What Expo hands out: ExponentPushToken[...] or ExpoPushToken[...]. Anything
  -- else is not an address we could send to, so it is not stored.
  constraint push_tokens_token_shape
    check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_:\-]{10,200}\]$')
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
-- No policies and no grants: the two functions below are the only way in.
revoke all on public.push_tokens from anon, authenticated;

-- The signed in user's phone. Security definer so it can move a token that
-- currently belongs to another account on the same phone.
create or replace function public.register_push_token(push_token text, device_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in to turn on notifications.' using errcode = '42501';
  end if;

  insert into public.push_tokens (token, user_id, platform)
  values (push_token, uid, device_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        last_seen_at = now();

  -- Ten phones is more than anyone has. Past that, the ones not seen for the
  -- longest go, so the table cannot be filled from one account.
  delete from public.push_tokens
   where user_id = uid
     and token not in (
       select token from public.push_tokens
        where user_id = uid
        order by last_seen_at desc
        limit 10
     );
end;
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- Only your own: a token that has since moved to another account stays put.
create or replace function public.unregister_push_token(push_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_tokens
   where token = push_token
     and user_id = auth.uid();
$$;

revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.unregister_push_token(text) to authenticated;

-- ---------------------------------------------------------------------------
-- notification_events
-- ---------------------------------------------------------------------------

create table if not exists public.notification_events (
  id           uuid        primary key default gen_random_uuid(),
  recipient_id uuid        not null references public.profiles (id) on delete cascade,
  actor_id     uuid        not null references public.profiles (id) on delete cascade,
  kind         text        not null check (kind in ('follow', 'like', 'new_prompt')),
  prompt_id    uuid        references public.prompts (id) on delete cascade,
  created_at   timestamptz not null default now()
);

-- "Has this person already been told about this?" is the only question asked.
create index if not exists notification_events_lookup_idx
  on public.notification_events (recipient_id, kind, created_at desc);

alter table public.notification_events enable row level security;
revoke all on public.notification_events from anon, authenticated;

commit;

-- Verification, signed in as A:
--   select from push_tokens                                   -> permission denied
--   rpc register_push_token('ExponentPushToken[abcdefghij]', 'android')  -> ok
--   rpc register_push_token('not a token', 'android')         -> 23514
-- Signed in as B, same phone:
--   rpc register_push_token(the same token, 'android')        -> ok, token is now B's
-- Signed in as A again:
--   rpc unregister_push_token(the same token)                 -> ok, removes nothing
-- Signed out:
--   rpc register_push_token(...)                              -> permission denied
