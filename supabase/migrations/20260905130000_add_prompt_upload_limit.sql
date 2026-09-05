-- Enforce daily upload limit of 3 prompts for unverified accounts
-- Tracks prompt uploads persistently across prompt deletions.

-- ---------------------------------------------------------------------------
-- prompt_uploads table & index
-- ---------------------------------------------------------------------------

create table if not exists public.prompt_uploads (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  prompt_id  uuid        references public.prompts (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists prompt_uploads_user_created_idx
  on public.prompt_uploads (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Functions & Triggers
-- ---------------------------------------------------------------------------

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

  if is_verified is true then
    return new;
  end if;

  day_start := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';

  select count(*) into daily_upload_count
  from public.prompt_uploads
  where user_id = new.user_id
    and created_at >= day_start;

  if daily_upload_count >= 3 then
    raise exception 'Daily prompt upload limit reached for unverified accounts (3 per day). Limit resets at midnight UTC.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Log prompt upload into prompt_uploads audit table on new prompt creation
create or replace function public.log_prompt_upload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.prompt_uploads (user_id, prompt_id, created_at)
  values (new.user_id, new.id, coalesce(new.created_at, now()));
  return new;
end;
$$;

create trigger check_prompt_upload_limit_trigger
  before insert on public.prompts
  for each row
  execute function public.check_prompt_upload_limit();

create trigger log_prompt_upload_trigger
  after insert on public.prompts
  for each row
  execute function public.log_prompt_upload();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.prompt_uploads enable row level security;

-- Users can view their own upload logs to check daily limits.
-- Writes are handled exclusively by the log_prompt_upload trigger (SECURITY DEFINER),
-- so no insert policy is needed.
create policy "Users can view their own prompt uploads"
  on public.prompt_uploads for select
  to authenticated
  using (auth.uid() = user_id);
