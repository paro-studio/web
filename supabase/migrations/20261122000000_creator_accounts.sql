-- Creator accounts, step 1 of invite-only posting.
--
-- Posting is going to be for approved creators only. This migration adds who
-- is a creator and a record of every change to it, and makes the three
-- day-one creators. It does NOT change who can post: the daily limit and the
-- verified exception stay exactly as they are. Posting is restricted later,
-- in its own migration, once the app and website show the Apply page.
--
--   profiles.is_creator     can post once posting is invite-only. Separate
--                           from `verified`, which is the blue tick and no
--                           daily limit
--   profiles.creator_since  when the current grant was made. Null while not a
--                           creator, and set again on reinstatement
--   creator_events          every grant and revoke: who, what, when, by whom
--                           and why. Never edited, never deleted by hand
--
-- Nobody can make themselves a creator. Clients may only write the profile
-- columns listed in 20260922120000, which these are not in. Changes go through
-- grant_creator and revoke_creator, run from the SQL editor:
--
--   select public.grant_creator('riya', 'Approved from the form', 'akshat');
--   select public.revoke_creator('riya', 'Posted spam', 'akshat');
--
-- The SQL editor connects as the same admin user for everyone, so the
-- database cannot tell admins apart by itself; `actor` is how each one signs
-- the change.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_creator boolean not null default false,
  add column if not exists creator_since timestamptz;

-- ---------------------------------------------------------------------------
-- 2. The record of changes
-- ---------------------------------------------------------------------------

create table if not exists public.creator_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('grant', 'revoke')),
  actor text not null check (char_length(actor) between 1 and 100),
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists creator_events_user_idx
  on public.creator_events (user_id, created_at desc);

-- Admins only: no policies and no grants, so the API sees nothing at all.
alter table public.creator_events enable row level security;
revoke all on public.creator_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Logging every change, whoever makes it
-- ---------------------------------------------------------------------------

-- Fires on any change to is_creator, including one typed straight into the
-- table editor, so nothing slips past the record. grant_creator and
-- revoke_creator pass the actor and reason through two settings that only
-- last for their own transaction.
create or replace function public.log_creator_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_creator is not distinct from old.is_creator then
    -- creator_since only moves with a grant or a revoke.
    new.creator_since := old.creator_since;
    return new;
  end if;

  new.creator_since := case when new.is_creator then now() else null end;

  insert into public.creator_events (user_id, action, actor, reason)
  values (
    new.id,
    case when new.is_creator then 'grant' else 'revoke' end,
    left(coalesce(nullif(current_setting('paro.creator_actor', true), ''), session_user::text), 100),
    nullif(current_setting('paro.creator_reason', true), '')
  );

  return new;
end;
$$;

revoke all on function public.log_creator_change() from public, anon, authenticated;

drop trigger if exists log_creator_change on public.profiles;
create trigger log_creator_change
  before update of is_creator, creator_since on public.profiles
  for each row execute function public.log_creator_change();

-- ---------------------------------------------------------------------------
-- 4. Granting and revoking
-- ---------------------------------------------------------------------------

-- Looks a username up, with or without the @. Raises if there is none.
create or replace function public.creator_target(target_username text)
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found public.profiles;
begin
  select * into found
  from public.profiles
  where username = lower(ltrim(btrim(target_username), '@'));

  if found.id is null then
    raise exception 'No account with the username %', target_username
      using errcode = 'P0002';
  end if;

  return found;
end;
$$;

create or replace function public.grant_creator(
  target_username text,
  reason text default null,
  actor text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles := public.creator_target(target_username);
begin
  if target.is_creator then
    raise exception '@% is already a creator', target.username
      using errcode = 'P0001';
  end if;

  perform set_config('paro.creator_actor', coalesce(nullif(btrim(actor), ''), session_user::text), true);
  perform set_config('paro.creator_reason', coalesce(btrim(reason), ''), true);
  update public.profiles set is_creator = true where id = target.id;
  perform set_config('paro.creator_actor', '', true);
  perform set_config('paro.creator_reason', '', true);
end;
$$;

create or replace function public.revoke_creator(
  target_username text,
  reason text default null,
  actor text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles := public.creator_target(target_username);
begin
  if not target.is_creator then
    raise exception '@% is not a creator', target.username
      using errcode = 'P0001';
  end if;

  perform set_config('paro.creator_actor', coalesce(nullif(btrim(actor), ''), session_user::text), true);
  perform set_config('paro.creator_reason', coalesce(btrim(reason), ''), true);
  update public.profiles set is_creator = false where id = target.id;
  perform set_config('paro.creator_actor', '', true);
  perform set_config('paro.creator_reason', '', true);
end;
$$;

-- Admins only. Supabase grants new functions to anon and authenticated by
-- default, so that is taken back explicitly.
revoke all on function public.creator_target(text) from public, anon, authenticated;
revoke all on function public.grant_creator(text, text, text) from public, anon, authenticated;
revoke all on function public.revoke_creator(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The day-one creators
-- ---------------------------------------------------------------------------

-- @parostudio, the official account, which stays verified as well, and the two
-- strongest contributors. Skipped quietly where the account does not exist,
-- as in CI, or is already a creator, so this can be run again.
do $$
declare
  name text;
begin
  foreach name in array array['parostudio', 'klprakhar', 'cliq'] loop
    if exists (select 1 from public.profiles where username = name and not is_creator) then
      perform public.grant_creator(name, 'Day-one creator', 'akshat');
    end if;
  end loop;
end;
$$;
