-- CI ONLY. Asserts that column-level grants and RLS policies match access
-- control requirements after all migrations are applied.
--
-- Fails with a descriptive error if:
--   1. Privileged columns (profiles.verified, prompts.view_count, prompts.copy_count)
--      are writable by anon or authenticated.
--   2. Legitimate app columns are not writable by authenticated users.
--   3. public.follows select policy is not public (using true).
--   4. public.saves select policy is not private to authenticated owners.
--   5. public.feedback or public.prompt_reports have any select policy.
--   6. public.prompt_uploads select policy is not owner-only, or has write policies.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. Privileged columns must NOT be client writable
-- ---------------------------------------------------------------------------
--
-- Verifies the revokes in 20260905000000_lock_down_privileged_columns.sql.
-- Because Postgres silently ignores column-level revokes against table-level
-- grants, has_column_privilege tests that the table-level grant was actually
-- replaced with column-specific grants.

do $$
begin
  -- profiles.verified
  if has_column_privilege('anon', 'public.profiles', 'verified', 'INSERT') then
    raise exception 'profiles.verified must not be writable: anon has INSERT';
  end if;
  if has_column_privilege('anon', 'public.profiles', 'verified', 'UPDATE') then
    raise exception 'profiles.verified must not be writable: anon has UPDATE';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'verified', 'INSERT') then
    raise exception 'profiles.verified must not be writable: authenticated has INSERT';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'verified', 'UPDATE') then
    raise exception 'profiles.verified must not be writable: authenticated has UPDATE';
  end if;

  -- prompts.view_count
  if has_column_privilege('anon', 'public.prompts', 'view_count', 'INSERT') then
    raise exception 'prompts.view_count must not be writable: anon has INSERT';
  end if;
  if has_column_privilege('anon', 'public.prompts', 'view_count', 'UPDATE') then
    raise exception 'prompts.view_count must not be writable: anon has UPDATE';
  end if;
  if has_column_privilege('authenticated', 'public.prompts', 'view_count', 'INSERT') then
    raise exception 'prompts.view_count must not be writable: authenticated has INSERT';
  end if;
  if has_column_privilege('authenticated', 'public.prompts', 'view_count', 'UPDATE') then
    raise exception 'prompts.view_count must not be writable: authenticated has UPDATE';
  end if;

  -- prompts.copy_count
  if has_column_privilege('anon', 'public.prompts', 'copy_count', 'INSERT') then
    raise exception 'prompts.copy_count must not be writable: anon has INSERT';
  end if;
  if has_column_privilege('anon', 'public.prompts', 'copy_count', 'UPDATE') then
    raise exception 'prompts.copy_count must not be writable: anon has UPDATE';
  end if;
  if has_column_privilege('authenticated', 'public.prompts', 'copy_count', 'INSERT') then
    raise exception 'prompts.copy_count must not be writable: authenticated has INSERT';
  end if;
  if has_column_privilege('authenticated', 'public.prompts', 'copy_count', 'UPDATE') then
    raise exception 'prompts.copy_count must not be writable: authenticated has UPDATE';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. App columns must remain writable by authenticated users
-- ---------------------------------------------------------------------------
--
-- Guards against over-revoking, which causes runtime 42501 errors when the app
-- attempts to edit profiles or prompts.

do $$
begin
  if not has_column_privilege('authenticated', 'public.profiles', 'username', 'UPDATE') then
    raise exception 'authenticated users must have UPDATE on public.profiles.username';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'UPDATE') then
    raise exception 'authenticated users must have UPDATE on public.profiles.avatar_url';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'cover_url', 'UPDATE') then
    raise exception 'authenticated users must have UPDATE on public.profiles.cover_url';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'bio', 'UPDATE') then
    raise exception 'authenticated users must have UPDATE on public.profiles.bio';
  end if;
  if not has_column_privilege('authenticated', 'public.prompts', 'title', 'UPDATE') then
    raise exception 'authenticated users must have UPDATE on public.prompts.title';
  end if;
  if not has_column_privilege('authenticated', 'public.prompts', 'tags', 'INSERT') then
    raise exception 'authenticated users must have INSERT on public.prompts.tags';
  end if;
  if not has_column_privilege('authenticated', 'public.prompts', 'tags', 'UPDATE') then
    raise exception 'authenticated users must have UPDATE on public.prompts.tags';
  end if;
  if not has_column_privilege('authenticated', 'public.prompts', 'image_url', 'INSERT') then
    raise exception 'authenticated users must have INSERT on public.prompts.image_url';
  end if;
  if not has_column_privilege('authenticated', 'public.prompts', 'image_url', 'UPDATE') then
    raise exception 'authenticated users must have UPDATE on public.prompts.image_url';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. public.follows: SELECT policy must be public (using true)
-- ---------------------------------------------------------------------------
--
-- Follower counts are shown on profiles to signed-out visitors. Scoping this
-- policy to the two parties makes follower counts read 0 to everyone else.

do $$
declare
  pol record;
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'follows' and c.relrowsecurity
  ) then
    raise exception 'RLS must be enabled on public.follows';
  end if;

  select * into pol
  from pg_policies
  where schemaname = 'public'
    and tablename = 'follows'
    and cmd = 'SELECT';

  if pol is null then
    raise exception 'public.follows must have a SELECT policy';
  end if;

  if not ('public' = any(pol.roles)) then
    raise exception 'public.follows SELECT policy must be granted to public (got: %)', pol.roles;
  end if;

  if trim(pol.qual) <> 'true' then
    raise exception 'public.follows SELECT policy must use "true" so follower counts are visible, got: %', pol.qual;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. public.saves: SELECT policy must be private (owner-only for authenticated)
-- ---------------------------------------------------------------------------
--
-- Saves are private. Users must only see what they saved themselves.

do $$
declare
  pol record;
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'saves' and c.relrowsecurity
  ) then
    raise exception 'RLS must be enabled on public.saves';
  end if;

  select * into pol
  from pg_policies
  where schemaname = 'public'
    and tablename = 'saves'
    and cmd = 'SELECT';

  if pol is null then
    raise exception 'public.saves must have a SELECT policy';
  end if;

  if pol.roles <> '{authenticated}' then
    raise exception 'public.saves SELECT policy must be restricted to authenticated (got: %)', pol.roles;
  end if;

  if replace(pol.qual, ' ', '') <> '(auth.uid()=user_id)' then
    raise exception 'public.saves SELECT policy must use (auth.uid() = user_id), got: %', pol.qual;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'saves'
      and cmd in ('SELECT', 'ALL')
      and ('anon' = any(roles) or 'public' = any(roles))
  ) then
    raise exception 'public.saves must not have any SELECT policy accessible by anon or public';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. public.feedback and public.prompt_reports: NO select policy
-- ---------------------------------------------------------------------------
--
-- These tables are write-only from the API. Feedback and reports must only be
-- reviewed in the Supabase dashboard by admins. Adding a SELECT policy here
-- would expose submissions to anyone holding the public anon key.

do $$
declare
  feedback_select_count int;
  reports_select_count int;
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'feedback' and c.relrowsecurity
  ) then
    raise exception 'RLS must be enabled on public.feedback';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'prompt_reports' and c.relrowsecurity
  ) then
    raise exception 'RLS must be enabled on public.prompt_reports';
  end if;

  select count(*) into feedback_select_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'feedback'
    and cmd in ('SELECT', 'ALL');

  if feedback_select_count > 0 then
    raise exception 'public.feedback must not have any SELECT or ALL policy (got %)', feedback_select_count;
  end if;

  select count(*) into reports_select_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'prompt_reports'
    and cmd in ('SELECT', 'ALL');

  if reports_select_count > 0 then
    raise exception 'public.prompt_reports must not have any SELECT or ALL policy (got %)', reports_select_count;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. public.prompt_uploads: SELECT policy must be owner-only, NO write policies
-- ---------------------------------------------------------------------------
--
-- Prompt upload logs track daily limits for unverified users. Users can inspect
-- their own upload history, but writes are exclusively managed by the database
-- trigger (SECURITY DEFINER) on prompt creation.

do $$
declare
  pol record;
  write_pol_count int;
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'prompt_uploads' and c.relrowsecurity
  ) then
    raise exception 'RLS must be enabled on public.prompt_uploads';
  end if;

  select * into pol
  from pg_policies
  where schemaname = 'public'
    and tablename = 'prompt_uploads'
    and cmd = 'SELECT';

  if pol is null then
    raise exception 'public.prompt_uploads must have a SELECT policy';
  end if;

  if pol.roles <> '{authenticated}' then
    raise exception 'public.prompt_uploads SELECT policy must be restricted to authenticated (got: %)', pol.roles;
  end if;

  if replace(pol.qual, ' ', '') <> '(auth.uid()=user_id)' then
    raise exception 'public.prompt_uploads SELECT policy must use (auth.uid() = user_id), got: %', pol.qual;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'prompt_uploads'
      and cmd in ('SELECT', 'ALL')
      and ('anon' = any(roles) or 'public' = any(roles))
  ) then
    raise exception 'public.prompt_uploads must not have any SELECT policy accessible by anon or public';
  end if;

  select count(*) into write_pol_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'prompt_uploads'
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');

  if write_pol_count > 0 then
    raise exception 'public.prompt_uploads must not have any write policies (got %)', write_pol_count;
  end if;
end;
$$;

