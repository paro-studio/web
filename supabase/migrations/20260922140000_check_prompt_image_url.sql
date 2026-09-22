-- Only accept prompt images from our own storage (issue #135).
--
-- The app uploads the image to the prompt-images bucket and saves its public
-- URL, but the API accepted any URL. Prompt images load for everyone who
-- scrolls the feed, so pointing one at your own server logged the IP of every
-- visitor, let you swap the picture later with nothing on our side noticing,
-- and skipped the type, size and count limits on uploads.
--
-- The URL now has to be a file in the uploader's own folder of the
-- prompt-images bucket, the same shape as the avatar and banner rules in
-- 20260922120100: https://<project>.supabase.co/storage/v1/object/public/
-- prompt-images/<user_id>/<file>. Every existing prompt already matches,
-- checked against production on 2026-09-22.
--
-- This is a trigger rather than a check constraint so it applies to the API
-- roles only. The SQL editor and the service role can already write anything,
-- so checking them protects nothing, and it lets supabase/seed.sql keep its
-- placeholder images, which it cannot upload from SQL. The function is security
-- invoker on purpose: current_user has to be the caller, not the owner.

create or replace function public.check_prompt_image_url()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.image_url !~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/prompt-images/'
                       || new.user_id::text || '/[^/?#]+(\?[^#]*)?$') then
    raise exception 'Prompt images must be uploaded through the app.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger check_prompt_image_url_trigger
  before insert or update of image_url, user_id on public.prompts
  for each row
  execute function public.check_prompt_image_url();
