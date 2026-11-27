-- CI ONLY. This is not part of the PARO schema and must never be run against a
-- real Supabase project.
--
-- Supabase provides the `auth` and `storage` schemas and the `anon` and
-- `authenticated` roles. A plain Postgres container does not, so the migrations
-- cannot be applied to one without them. This file creates the smallest stubs
-- that let every migration run, so CI can prove the migrations execute cleanly
-- from an empty database.
--
-- These stubs are deliberately dumb. They give the migrations something to
-- reference, they do not reproduce Supabase behaviour. auth.uid() returns null
-- here, so this proves migrations *run*, not that policies *work*.
--
-- If a migration starts using a new auth.* or storage.* object, add it here.

create schema if not exists auth;
create schema if not exists storage;

-- Roles the grants and policies reference.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
  -- The role Supabase Auth runs its hooks as.
  if not exists (select from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin;
  end if;
end
$$;

-- Supabase grants these by default on everything in `public`. The migrations
-- revoke and re-grant column by column, so CI has to start from the same place
-- or it is not testing the real situation.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$ select null::uuid $$;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text
);

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$ select string_to_array(name, '/') $$;
