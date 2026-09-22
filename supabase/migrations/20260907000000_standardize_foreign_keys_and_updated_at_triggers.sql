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
