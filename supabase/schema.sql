-- PARO Studio database schema
--
-- GENERATED FILE. Do not edit this by hand, your changes will be overwritten.
-- Built from supabase/migrations/ by `npm run db:schema`.
--
-- To change the schema, add a migration instead:
--   supabase migration new <name>
--   ...write your SQL...
--   npm run db:schema
-- See CONTRIBUTING.md.
--
-- Run this once against a fresh Supabase project to get a working local setup.
-- Supabase dashboard -> SQL Editor -> paste -> Run.
--
-- This creates structure only. It contains no data of any kind.

-- --------------------------------------------------------------------------
-- 20260101000000_initial_schema.sql
-- --------------------------------------------------------------------------

-- Baseline: the PARO Studio schema as it stood before migrations existed.
--
-- This is a checkpoint, not a change. It describes the database that was built
-- by hand in the Supabase SQL Editor over the life of the project, so that a
-- fresh project can be rebuilt from migrations alone.
--
-- Production already has all of this. It was marked applied with
-- `supabase migration repair --status applied 20260101000000` rather than run.
--
-- Some details are marked INFERRED. They were reconstructed from
-- src/services/supabase/database.types.ts and the live RLS policies rather than
-- dumped from the database, so defaults and constraints may differ slightly
-- from production.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per user, created on first sign in. `id` matches auth.users.id.
create table if not exists public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  username    text        unique,
  full_name   text,
  avatar_url  text,
  cover_url   text,
  bio         text,
  website     text,
  verified    boolean     not null default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists public.prompts (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  title       text        not null,
  prompt      text        not null,
  image_url   text        not null,
  ai_tool     text        not null,
  tags        text[],
  view_count  integer     not null default 0,
  copy_count  integer     not null default 0,
  created_at  timestamptz not null default now(),
  -- Not a typo, and not consistent with anything else here. This is the only
  -- timestamp column in the database without a timezone. A later migration
  -- fixes it; this file records what production has.
  updated_at  timestamp   not null default now()
);

-- The uniqueness rules for likes, saves and follows live as named unique
-- indexes further down rather than inline here, because that is how production
-- has them.

create table if not exists public.likes (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  prompt_id  uuid        not null references public.prompts (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.saves (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  prompt_id  uuid        not null references public.prompts (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.follows (
  id           uuid        primary key default gen_random_uuid(),
  follower_id  uuid        not null references public.profiles (id) on delete cascade,
  following_id uuid        not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  constraint no_self_follow check (follower_id <> following_id)
);

-- Feedback submitted from /feedback. Write only from the app. You read these
-- in the Supabase dashboard, which is why there is no select policy below.
create table if not exists public.feedback (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  subject    text        not null,
  message    text        not null,
  created_at timestamptz not null default now()
);

-- Accuracy ratings (1-5 stars) submitted by users for prompts.
create table if not exists public.prompt_ratings (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  prompt_id  uuid        not null references public.prompts (id) on delete cascade,
  rating     smallint    not null check (rating >= 1 and rating <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- stops one user rating the same prompt twice.
  unique (user_id, prompt_id)
);

-- User reports submitted against prompts. Insert-only from the app; review in
-- the Supabase dashboard. The reason column is an enum-like text column
-- constrained to the values the UI surfaces.
create table if not exists public.prompt_reports (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  prompt_id  uuid        not null references public.prompts (id) on delete cascade,
  reason     text        not null check (reason in ('spam','misleading','inappropriate','copyright','other')),
  details    text,
  created_at timestamptz not null default now(),
  -- One report per user per prompt. If they already reported it, surface a
  -- friendly "already reported" message instead of a generic error.
  unique (user_id, prompt_id)
);

-- Upload history tracking for prompt rate limiting / daily caps.
-- Persists even if prompts are subsequently deleted by the user.
create table if not exists public.prompt_uploads (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  prompt_id  uuid        references public.prompts (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Indexes, as production actually has them. An earlier version of this file
-- also listed prompts_user_id, prompts_created_at, likes_prompt_id and
-- follows_following. Production has never had those. `supabase db diff` on
-- 2026-09-05 proved it, and they were removed here so this file describes the
-- database rather than the database somebody meant to build.
--
-- They are worth adding, and a later migration does exactly that. This one is
-- a checkpoint, not a wish list.
create index if not exists prompt_ratings_prompt_id_idx on public.prompt_ratings (prompt_id);
create index if not exists prompt_reports_prompt_id_idx on public.prompt_reports (prompt_id);
create index if not exists prompt_uploads_user_created_idx on public.prompt_uploads (user_id, created_at desc);

-- Named separately in production rather than declared inline on the tables
-- above, so they are reproduced with the names production uses. Renaming them
-- would show up as drift on every future diff.
create unique index if not exists likes_user_prompt_unique  on public.likes  (user_id, prompt_id);
create unique index if not exists saves_unique_user_prompt  on public.saves  (user_id, prompt_id);
create unique index if not exists follows_unique_user_pair  on public.follows (follower_id, following_id);

-- Production carries two identical unique constraints on profiles.username,
-- `profiles_username_key` from the inline `unique` above and this one added
-- later by hand. Both are real, so both are here. A later migration drops the
-- redundant one.
alter table public.profiles
  add constraint profiles_username_unique unique (username);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- View and copy counts are bumped by any viewer, not just the prompt owner.
-- The UPDATE policy on prompts only allows the owner to write, so these run
-- as security definer to bypass it. Without that, counters never increment.

create or replace function public.increment_view_count(prompt_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.prompts
     set view_count = view_count + 1
   where id = prompt_id;
$$;

create or replace function public.increment_copy_count(prompt_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.prompts
     set copy_count = copy_count + 1
   where id = prompt_id;
$$;

-- Daily prompt upload limit enforcement for unverified accounts (max 3 uploads/day, resets at midnight UTC)
create or replace function public.check_prompt_upload_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_verified boolean;
  daily_upload_count integer;
  day_start timestamptz;
begin
  select coalesce(verified, false) into is_verified
  from public.profiles
  where id = new.user_id;

  -- Verified accounts have no daily limit restriction
  if is_verified is true then
    return new;
  end if;

  -- Start of current UTC calendar day (12:00 AM UTC)
  day_start := date_trunc('day', now() at time zone 'utc') at time zone 'utc';

  select count(*) into daily_upload_count
  from public.prompt_uploads
  where user_id = new.user_id
    and created_at >= day_start;

  if daily_upload_count >= 3 then
    raise exception 'Daily upload limit reached. Unverified accounts can upload a maximum of 3 prompts per day.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Automatically record an upload in prompt_uploads on prompt creation
create or replace function public.log_prompt_upload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.prompt_uploads (user_id, prompt_id, created_at)
  values (new.user_id, new.id, new.created_at);
  return new;
end;
$$;

drop trigger if exists check_prompt_upload_limit_trigger on public.prompts;
create trigger check_prompt_upload_limit_trigger
  before insert on public.prompts
  for each row
  execute function public.check_prompt_upload_limit();

drop trigger if exists log_prompt_upload_trigger on public.prompts;
create trigger log_prompt_upload_trigger
  after insert on public.prompts
  for each row
  execute function public.log_prompt_upload();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- RLS, and the column grants added by a later migration, are the only things
-- protecting this data. The anon key is public and ships in the client bundle,
-- so any table without RLS is readable and writable by anyone with a browser.
-- RLS decides which rows, the grants decide which columns. You need both.
-- Do not disable either.

alter table public.profiles       enable row level security;
alter table public.prompts        enable row level security;
alter table public.likes          enable row level security;
alter table public.saves          enable row level security;
alter table public.follows        enable row level security;
alter table public.feedback       enable row level security;
alter table public.prompt_ratings enable row level security;
alter table public.prompt_reports enable row level security;
alter table public.prompt_uploads enable row level security;

-- profiles -------------------------------------------------------------------
-- Public read is deliberate: profiles are shown to signed-out visitors.
-- Never add a private column (email, phone) to this table.

create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- prompts --------------------------------------------------------------------

create policy "Public can read prompts"
  on public.prompts for select
  to anon, authenticated
  using (true);

create policy "Authenticated users can insert prompts"
  on public.prompts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own prompts"
  on public.prompts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own prompts"
  on public.prompts for delete
  to authenticated
  using (auth.uid() = user_id);

-- likes ----------------------------------------------------------------------

create policy "Public can read likes"
  on public.likes for select
  using (true);

create policy "Users can insert their own likes"
  on public.likes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete their own likes"
  on public.likes for delete
  to authenticated
  using (auth.uid() = user_id);

-- saves ----------------------------------------------------------------------
-- Saves are private. A user must not see what anyone else has saved.

create policy "Users can view their own saves"
  on public.saves for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can save prompts"
  on public.saves for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete their own saves"
  on public.saves for delete
  to authenticated
  using (auth.uid() = user_id);

-- follows --------------------------------------------------------------------
-- Read must be public. Follower counts are shown on profiles to signed-out
-- visitors, and a count query only sees rows RLS lets through. Scoping this
-- to the two parties made every follower count read 0 on other people's
-- profiles.

create policy "Public can read follows"
  on public.follows for select
  using (true);

create policy "Users can follow others"
  on public.follows for insert
  to authenticated
  with check (auth.uid() = follower_id);

create policy "Users can unfollow others"
  on public.follows for delete
  to authenticated
  using (auth.uid() = follower_id);

-- feedback -------------------------------------------------------------------
-- Insert only, and only for yourself. There is deliberately no select policy,
-- so nobody can read feedback through the API, not even their own. Read it in
-- the dashboard instead. Adding a select policy here would expose every
-- submission to anyone holding the anon key, which is everyone.

create policy "Users can submit feedback"
  on public.feedback for insert
  to authenticated
  with check (auth.uid() = user_id);

-- prompt_ratings -------------------------------------------------------------
-- Anyone can read ratings, but users can only insert, update, or delete their own.

create policy "Public can read prompt ratings"
  on public.prompt_ratings for select
  using (true);

create policy "Users can rate prompts"
  on public.prompt_ratings for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own prompt ratings"
  on public.prompt_ratings for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own prompt ratings"
  on public.prompt_ratings for delete
  to authenticated
  using (auth.uid() = user_id);

-- prompt_reports -------------------------------------------------------------
-- Insert only, same philosophy as feedback: nobody can read reports through the
-- API. Review them in the Supabase dashboard.

create policy "Users can submit reports"
  on public.prompt_reports for insert
  to authenticated
  with check (auth.uid() = user_id);

-- prompt_uploads -------------------------------------------------------------
-- Users can view their own upload logs to check daily limits.
-- Writes are handled exclusively by the log_prompt_upload trigger (SECURITY DEFINER),
-- so no insert policy is needed.

create policy "Users can view their own prompt uploads"
  on public.prompt_uploads for select
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
--
-- All three buckets are public read. Files are laid out as {user_id}/{file},
-- and the policies use the first path segment to decide ownership.

insert into storage.buckets (id, name, public)
values
  ('avatars',       'avatars',       true),
  ('banners',       'banners',       true),
  ('prompt-images', 'prompt-images', true)
on conflict (id) do nothing;

-- avatars --------------------------------------------------------------------

create policy "Public read avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users can update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- banners --------------------------------------------------------------------

create policy "Public read banners"
  on storage.objects for select
  using (bucket_id = 'banners');

create policy "Users can upload own banner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'banners'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users can update own banner"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'banners'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own banner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'banners'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- prompt-images --------------------------------------------------------------
-- The folder check on insert matters. Without it any signed-in user can write
-- arbitrary files anywhere in the bucket, including into another user's folder.

create policy "Users can upload own prompt images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'prompt-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy "Users can view own prompt images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'prompt-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy "Users can delete own prompt images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'prompt-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

-- --------------------------------------------------------------------------
-- 20260905000000_lock_down_privileged_columns.sql
-- --------------------------------------------------------------------------

-- Lock down privileged columns and storage buckets.
--
-- Fixes three issues where the client, holding only the public anon key, could
-- write things the app never intended it to write.
--
--   1. profiles.verified          a user could grant themselves a verified badge
--   2. prompts.view_count         a user could inflate their own trending rank
--      prompts.copy_count
--   3. storage buckets            no server side size or MIME limit, so the
--                                 JS checks in services/supabase/storage.ts
--                                 could be skipped entirely
--
-- Safe to run more than once.
--
-- Why this is written as revoke-then-grant rather than a column level revoke:
-- Supabase grants `anon` and `authenticated` table level INSERT and UPDATE on
-- everything in `public` by default. Postgres will not let a column level
-- revoke punch a hole in a table level grant. From the REVOKE docs: "if a role
-- has been granted privileges on a table, then revoking the same privileges
-- from individual columns will have no effect." It does not error, it silently
-- does nothing. The only way to restrict columns is to drop the table level
-- grant and re-grant column by column, which is what happens below.

-- ---------------------------------------------------------------------------
-- profiles.verified
-- ---------------------------------------------------------------------------
--
-- `verified` is now writable only by the service role and by anything running
-- as the table owner. Set a badge from the dashboard:
--   update public.profiles set verified = true where username = 'someone';

revoke insert, update on public.profiles from anon, authenticated;

grant insert (id, username, full_name, avatar_url, cover_url, bio, website,
              created_at, updated_at)
  on public.profiles to anon, authenticated;

-- `id` is deliberately absent. It is the primary key, it references
-- auth.users, and every profiles RLS policy keys off it.
grant update (username, full_name, avatar_url, cover_url, bio, website,
              updated_at)
  on public.profiles to anon, authenticated;

-- ---------------------------------------------------------------------------
-- prompts.view_count and prompts.copy_count
-- ---------------------------------------------------------------------------
--
-- These stay writable through increment_view_count and increment_copy_count,
-- which are security definer and run as the function owner, so they are not
-- affected by the grants below. App code only ever reads these columns.

revoke insert, update on public.prompts from anon, authenticated;

grant insert (id, user_id, title, prompt, image_url, ai_tool, tags,
              created_at, updated_at)
  on public.prompts to anon, authenticated;

-- `user_id` is deliberately absent, so a prompt cannot change hands.
grant update (title, prompt, image_url, ai_tool, tags, updated_at)
  on public.prompts to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage limits
-- ---------------------------------------------------------------------------
--
-- These mirror the client side checks in src/services/supabase/storage.ts.
-- The anon key is public, so the client checks are a convenience for honest
-- users, not a control. Keep the two in sync when either changes.

update storage.buckets
   set file_size_limit   = 2097152,  -- 2 MB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'avatars';

update storage.buckets
   set file_size_limit   = 5242880,  -- 5 MB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'banners';

update storage.buckets
   set file_size_limit   = 3145728,  -- 3 MB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'prompt-images';

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
--
-- Run this after. Every column in the first row must come back false, and the
-- three buckets must come back with a limit and a MIME list.
--
--   select
--     has_column_privilege('authenticated', 'public.profiles', 'verified',   'INSERT') as ins_verified_auth,
--     has_column_privilege('authenticated', 'public.profiles', 'verified',   'UPDATE') as upd_verified_auth,
--     has_column_privilege('anon',          'public.profiles', 'verified',   'INSERT') as ins_verified_anon,
--     has_column_privilege('authenticated', 'public.prompts',  'view_count', 'UPDATE') as upd_views_auth,
--     has_column_privilege('authenticated', 'public.prompts',  'copy_count', 'UPDATE') as upd_copies_auth;
--
--   select id, file_size_limit, allowed_mime_types from storage.buckets;
--
-- Then smoke test the app, since these are the flows the grants above touch:
--   1. sign in with a brand new account and complete the profile
--   2. edit an existing profile, name, bio, avatar, banner
--   3. create a prompt with an image, then edit it
--   4. copy a prompt, reload, confirm the counter still moved

-- --------------------------------------------------------------------------
-- 20260905120000_add_indexes_and_column_constraints.sql
-- --------------------------------------------------------------------------

-- Fixes three defects found by diffing production against the migrations on
-- 2026-09-05, plus the two length caps left over from the September audit.
--
-- Nothing here is a schema redesign. Each item is something the database
-- already should have had and did not.

-- ---------------------------------------------------------------------------
-- Missing indexes
-- ---------------------------------------------------------------------------
--
-- The app filters and sorts on these constantly and production has never had
-- an index on any of them. Every one of these queries is a sequential scan
-- today. It does not hurt yet because the tables are small, and it gets
-- linearly worse with every prompt added.
--
-- Plain `create index`, not `concurrently`: concurrently cannot run inside a
-- transaction and these tables are small enough that the lock is momentary.
-- Revisit if the tables ever get large.

-- The feed's main query: order by created_at desc.
create index if not exists prompts_created_at_idx on public.prompts (created_at desc);

-- Profile pages, and "my prompts".
create index if not exists prompts_user_id_idx on public.prompts (user_id);

-- Like counts are read per prompt. This is also the FK target for the cascade
-- when a prompt is deleted, so without it deleting one prompt scans the whole
-- likes table.
create index if not exists likes_prompt_id_idx on public.likes (prompt_id);

-- Follower counts on a profile. The existing follows_unique_user_pair index
-- covers follower_id as its leading column, but nothing covers following_id.
create index if not exists follows_following_id_idx on public.follows (following_id);

-- Deliberately not adding saves (user_id). saves_unique_user_prompt is already
-- (user_id, prompt_id), and Postgres can use a leading column on its own, so a
-- separate index would be dead weight.

-- ---------------------------------------------------------------------------
-- prompts.updated_at: timestamp -> timestamptz
-- ---------------------------------------------------------------------------
--
-- This is the only timestamp column in the database without a timezone. Every
-- other created_at and updated_at is timestamptz.
--
-- The app writes new Date().toISOString(), which ends in Z. Postgres parsed
-- that, discarded the offset and stored the UTC wall clock. So the values are
-- correct UTC readings that are simply not labelled as such, which is why the
-- `using` clause below reads them as UTC. Without it Postgres would interpret
-- them in the server timezone and silently shift every row.

alter table public.prompts
  alter column updated_at type timestamptz
  using updated_at at time zone 'UTC';

-- ---------------------------------------------------------------------------
-- Duplicate unique constraint on profiles.username
-- ---------------------------------------------------------------------------
--
-- Production carries two identical unique constraints on the same column:
-- profiles_username_key, created by the inline `unique` on the table, and
-- profiles_username_unique, added by hand later. Both are enforced on every
-- insert and update, for one rule.
--
-- Dropping the hand added one. profiles_username_key stays, so uniqueness is
-- unchanged.

alter table public.profiles
  drop constraint if exists profiles_username_unique;

-- ---------------------------------------------------------------------------
-- Length caps on free text
-- ---------------------------------------------------------------------------
--
-- feedback.message, feedback.subject and prompt_reports.details had no limit
-- at all. The anon key is public, so the form is not a control: anyone could
-- post a multi-megabyte string straight to the API, repeatedly.
--
-- The limits are set above what the UI allows, so they act as an abuse
-- backstop rather than a second copy of the form's validation. The form caps
-- subject at 200 and message at 5000, and the report dialog caps details at
-- 500.
--
-- `not valid` skips the check against existing rows. New and updated rows are
-- still checked. The tables should have nothing near these limits, but a
-- migration that fails on old data is worse than one that starts from here.

alter table public.feedback
  add constraint feedback_subject_length check (char_length(subject) <= 500) not valid;

alter table public.feedback
  add constraint feedback_message_length check (char_length(message) <= 10000) not valid;

alter table public.prompt_reports
  add constraint prompt_reports_details_length check (char_length(details) <= 2000) not valid;

-- Turn the checks into full constraints if the existing rows pass, which they
-- should. Wrapped so an unexpectedly long historic row leaves the constraint
-- in place for new writes rather than failing the whole migration.
do $$
begin
  alter table public.feedback validate constraint feedback_subject_length;
  alter table public.feedback validate constraint feedback_message_length;
  alter table public.prompt_reports validate constraint prompt_reports_details_length;
exception
  when check_violation then
    raise notice 'Existing rows exceed the new length limits. Constraints are active for new writes but not validated against history.';
end
$$;

-- --------------------------------------------------------------------------
-- 20260907000000_standardize_foreign_keys_and_updated_at_triggers.sql
-- --------------------------------------------------------------------------

-- Standardise foreign keys and add an updated_at trigger.
--
-- Addresses two schema inconsistencies that make the data model harder to
-- reason about (issue #106):
--
--   1. Foreign keys pointed at two different tables: profiles, prompts,
--      feedback, and prompt_reports referenced auth.users, while likes, saves,
--      follows, and prompt_ratings referenced public.profiles.
--
--      Convention applied: public.profiles.id is the single bridge to
--      auth.users (id). All other public tables reference public.profiles (id)
--      on delete cascade. This keeps foreign keys within the public schema,
--      allows PostgREST relationship discovery/embeds, and simplifies cascade
--      deletion on account deletion.
--
--   2. No triggers existed for updated_at. Callers wrote it by hand on the
--      client, risking clock drift and stale timestamps on missed write paths.
--      A database trigger now maintains updated_at on public.profiles,
--      public.prompts, and public.prompt_ratings.

-- ---------------------------------------------------------------------------
-- Standardise foreign keys to public.profiles
-- ---------------------------------------------------------------------------

alter table public.prompts
  drop constraint if exists prompts_user_id_fkey,
  add constraint prompts_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.feedback
  drop constraint if exists feedback_user_id_fkey,
  add constraint feedback_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.prompt_reports
  drop constraint if exists prompt_reports_user_id_fkey,
  add constraint prompt_reports_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- updated_at trigger function and triggers
-- ---------------------------------------------------------------------------

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.handle_updated_at();

drop trigger if exists set_prompts_updated_at on public.prompts;
create trigger set_prompts_updated_at
  before update on public.prompts
  for each row
  execute function public.handle_updated_at();

drop trigger if exists set_prompt_ratings_updated_at on public.prompt_ratings;
create trigger set_prompt_ratings_updated_at
  before update on public.prompt_ratings
  for each row
  execute function public.handle_updated_at();

-- --------------------------------------------------------------------------
-- After running this
-- --------------------------------------------------------------------------
--
-- 1. Authentication -> Providers: enable Email. Enable Google if you want to
--    test Google sign in, otherwise email and password is enough.
-- 2. Settings -> API: copy the Project URL and the anon key into .env.local.
-- 3. npm run dev, create an account, and you should land on /complete-profile.
--
-- To set yourself as verified so the badge shows up, run this in the SQL
-- Editor. It is the only way, the app cannot write that column:
--   update public.profiles set verified = true where username = 'your_username';
