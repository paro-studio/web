-- Throttle the view and copy counters.
--
-- increment_view_count and increment_copy_count are security definer so any
-- viewer can bump a prompt's counters. They also had no identity check and no
-- limit, so anyone holding the public anon key could call them in a loop and
-- push any prompt up the trending feed, which sorts on view_count.
--
-- The column lockdown in 20260905000000 stops direct writes to the counters.
-- This closes the other path, the functions themselves.
--
-- Rules:
--
--   Copies  count only for signed in users, once per user per prompt per 24
--           hours. The UI already sends signed out users to sign in before
--           copying, so an anonymous copy call is ignored.
--
--   Views   signed in: once per user per prompt per 30 minutes.
--           signed out: once per visitor IP per prompt per 30 minutes, and no
--           more than 30 signed out views per prompt per hour in total. The IP
--           comes from a request header, which is best effort, so the hourly
--           cap is what bounds inflation if the header is ever spoofed.
--
-- The 30 minute view window matches the client side dedupe in
-- src/lib/viewTracking.ts, so honest visitors are counted exactly as before.
--
-- Signatures are unchanged, (prompt_id uuid) returns void, so the app needs no
-- change and existing grants carry over.

-- ---------------------------------------------------------------------------
-- Counter events
-- ---------------------------------------------------------------------------
--
-- One row per actor per prompt per kind. counted_at moves forward each time the
-- actor is counted again, so the table stays small.
--
-- actor is 'u:<user id>' for signed in callers and 'ip:<md5 of the IP>' for
-- signed out ones. The IP is hashed so raw addresses are never stored.

create table if not exists public.prompt_counter_events (
  prompt_id  uuid        not null references public.prompts (id) on delete cascade,
  kind       text        not null check (kind in ('view', 'copy')),
  actor      text        not null,
  counted_at timestamptz not null default now(),
  primary key (prompt_id, kind, actor)
);

create index if not exists prompt_counter_events_counted_at_idx
  on public.prompt_counter_events (counted_at);

-- Only the two functions below touch this table. RLS on with no policies, plus
-- no table privileges for the API roles, means clients can neither read nor
-- write it.
alter table public.prompt_counter_events enable row level security;

revoke all on public.prompt_counter_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shared logic
-- ---------------------------------------------------------------------------
--
-- Returns true when this call should be counted, and records it. The insert
-- and the window check are one statement, so two simultaneous calls from the
-- same actor cannot both be counted.

create or replace function public.claim_prompt_counter(
  target_prompt uuid,
  counter_kind  text,
  counter_actor text,
  counter_window interval
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  insert into public.prompt_counter_events as e (prompt_id, kind, actor, counted_at)
  values (target_prompt, counter_kind, counter_actor, now())
  on conflict (prompt_id, kind, actor) do update
    set counted_at = now()
    where e.counted_at < now() - counter_window
  returning true into claimed;

  -- Occasionally drop rows too old to affect any window, so the table does not
  -- grow without bound. Cheap enough to do inline at this traffic.
  if random() < 0.01 then
    delete from public.prompt_counter_events
     where counted_at < now() - interval '2 days';
  end if;

  return coalesce(claimed, false);
end;
$$;

-- Internal helper. Nothing outside the two counter functions should call it.
revoke all on function public.claim_prompt_counter(uuid, text, text, interval)
  from public, anon, authenticated;

-- The caller's identity: their user id when signed in, otherwise a hash of the
-- client IP PostgREST passes through. Falls back to 'ip:unknown' when there is
-- no header, which then shares one bucket and the hourly cap.
create or replace function public.prompt_counter_actor()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  headers json;
  ip text;
begin
  if uid is not null then
    return 'u:' || uid::text;
  end if;

  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    headers := null;
  end;

  ip := trim(split_part(coalesce(headers ->> 'x-forwarded-for', headers ->> 'x-real-ip', ''), ',', 1));

  if ip = '' then
    return 'ip:unknown';
  end if;

  return 'ip:' || md5(ip);
end;
$$;

revoke all on function public.prompt_counter_actor()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The counters
-- ---------------------------------------------------------------------------

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
  if not exists (select 1 from public.prompts p where p.id = target) then
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

create or replace function public.increment_copy_count(prompt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := increment_copy_count.prompt_id;
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;

  if not exists (select 1 from public.prompts p where p.id = target) then
    return;
  end if;

  if public.claim_prompt_counter(target, 'copy', 'u:' || uid::text, interval '24 hours') then
    update public.prompts p
       set copy_count = p.copy_count + 1
     where p.id = target;
  end if;
end;
$$;
