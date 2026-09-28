-- Stop clients choosing created_at on prompts and profiles.
--
-- created_at was in the column insert grants from 20260905000000, so anyone
-- calling the API could pick it. Two things trusted that value:
--
--   1. The daily upload limit. log_prompt_upload logged each upload with
--      coalesce(new.created_at, now()), and check_prompt_upload_limit only
--      counts uploads since midnight UTC. A prompt dated last year was logged
--      as last year and never counted, so the 3 per day limit could be skipped
--      entirely.
--   2. The Newest feed, which orders by created_at. A prompt dated 2099 stayed
--      at the top forever.
--
-- The app never sends created_at. The column default fills it in, so nothing
-- in the client changes.
--
-- Same revoke then grant pattern as 20260905000000. A column level revoke does
-- nothing while a table level grant exists, and revoking the table privilege
-- also drops the column ones, so the remaining columns are granted back one by
-- one. The lists below are the previous ones minus created_at.

revoke insert on public.prompts from anon, authenticated;

grant insert (id, user_id, title, prompt, image_url, ai_tool, tags, updated_at)
  on public.prompts to anon, authenticated;

revoke insert on public.profiles from anon, authenticated;

grant insert (id, username, full_name, avatar_url, cover_url, bio, website,
              updated_at)
  on public.profiles to anon, authenticated;

-- Log the upload at the moment it happened, whatever the row says. Anything
-- running as the table owner, like the service role, can still set
-- created_at, and that must not be able to slip past the limit either.
create or replace function public.log_prompt_upload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.prompt_uploads (user_id, prompt_id, created_at)
  values (new.user_id, new.id, now());
  return new;
end;
$$;
