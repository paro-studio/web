-- Report a user and block a user.
--
-- Google Play expects an app where people post to offer both: a way to report
-- a person, not only a single prompt, and a way to stop seeing someone. Until
-- now only prompts could be reported (prompt_reports) and nobody could be
-- blocked. The Android app is the first client; the website can follow.
--
-- user_reports  Same philosophy as prompt_reports and feedback: insert only,
--               and only as yourself. There is deliberately no select policy,
--               so nobody can read reports through the API, not even their
--               own. Review them in the Supabase dashboard.
--
-- blocks        Private, like saves. You can read, add and remove only your
--               own rows, so nobody can find out who has blocked them. A
--               block is one way: it hides the blocked person's prompts from
--               the blocker. The clients do the hiding, by leaving blocked
--               creators out of their list queries. It does not stop the
--               blocked person seeing public prompts, which anyone signed out
--               can see anyway.
--
-- Both follow the convention from 20260907000000: every public table points
-- at public.profiles (id) and deletes with it, so deleting an account removes
-- the reports it made, the reports about it, and its blocks in both
-- directions.
--
-- Clients may only send the columns listed in the grants. id and created_at
-- are the database's to set, for the same reason created_at was locked on
-- prompts and profiles in 20260922120000.

-- ---------------------------------------------------------------------------
-- user_reports
-- ---------------------------------------------------------------------------

create table if not exists public.user_reports (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  reported_id uuid        not null references public.profiles (id) on delete cascade,
  reason      text        not null check (reason in ('spam','harassment','inappropriate','impersonation','other')),
  details     text        check (char_length(details) <= 2000),
  created_at  timestamptz not null default now(),
  -- One report per user per person. A second one comes back as 23505, which
  -- the clients show as "already reported".
  unique (user_id, reported_id),
  constraint user_reports_not_self check (user_id <> reported_id)
);

-- For reading every report about one person in the dashboard.
create index if not exists user_reports_reported_id_idx on public.user_reports (reported_id);

alter table public.user_reports enable row level security;

create policy "Users can report other users"
  on public.user_reports for insert
  to authenticated
  with check (auth.uid() = user_id);

revoke all on public.user_reports from anon, authenticated;
grant insert (user_id, reported_id, reason, details) on public.user_reports to authenticated;

-- ---------------------------------------------------------------------------
-- blocks
-- ---------------------------------------------------------------------------

create table if not exists public.blocks (
  id         uuid        primary key default gen_random_uuid(),
  blocker_id uuid        not null references public.profiles (id) on delete cascade,
  blocked_id uuid        not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Also the index that serves "everyone I have blocked", the only read.
  unique (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

create policy "Users can view their own blocks"
  on public.blocks for select
  to authenticated
  using (auth.uid() = blocker_id);

create policy "Users can block others"
  on public.blocks for insert
  to authenticated
  with check (auth.uid() = blocker_id);

create policy "Users can unblock"
  on public.blocks for delete
  to authenticated
  using (auth.uid() = blocker_id);

revoke all on public.blocks from anon, authenticated;
grant select, delete on public.blocks to authenticated;
grant insert (blocker_id, blocked_id) on public.blocks to authenticated;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
--
-- After applying, with the anon key and no session:
--   select from user_reports  -> permission denied
--   select from blocks        -> permission denied
--
-- Signed in as A:
--   insert into blocks (blocker_id, blocked_id) values (A, B)   -> ok
--   insert the same row again                                    -> 23505
--   insert into blocks (blocker_id, blocked_id) values (B, A)   -> 42501, not yours
--   insert into blocks (blocker_id, blocked_id) values (A, A)   -> 23514
--   select from blocks                                           -> only A's rows
--   insert into user_reports (user_id, reported_id, reason)
--     values (A, B, 'spam')                                      -> ok
--   select from user_reports                                     -> permission denied
