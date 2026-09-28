-- Enforce profile field rules in the database, not just in the forms.
--
-- The anon key is public, so the forms in CompleteProfile.tsx and Settings.tsx
-- are a convenience, not a control. Before this, the API accepted:
--
--   username    anything unique. Case, spaces and lookalike letters made room
--               for impersonation: "Akshat", "akshat " or "аkshat" with a
--               Cyrillic а were all distinct from "akshat"
--   avatar_url  any URL. Avatars load on profiles, prompt pages and Top
--   cover_url   Creators, so pointing one at your own server logs the IP of
--               everyone who views them, with content we cannot moderate
--   website     any string, including javascript: links. Not shown anywhere
--               yet, locked down before it ever is
--   full_name   no length limit
--   bio
--
-- Limits sit above what the forms allow, so they are a backstop rather than a
-- second copy of form validation. Every existing row already passes, checked
-- against production on 2026-09-22.
--
-- Image URLs must be a file in the user's own folder in our storage bucket, or
-- for avatars a Google profile photo, which is what a first sign in copies over.
-- The host is matched as any *.supabase.co so contributors' own projects work.
-- That still allows a file in someone else's Supabase project laid out the same
-- way. Pinning the exact project host would close that too, but would need the
-- host inside the migration.

alter table public.profiles
  add constraint profiles_username_format
    check (username ~ '^[a-z0-9_]{3,30}$') not valid,
  add constraint profiles_full_name_length
    check (char_length(full_name) <= 100) not valid,
  add constraint profiles_bio_length
    check (char_length(bio) <= 500) not valid,
  add constraint profiles_website_format
    check (website ~ '^https?://' and char_length(website) <= 200) not valid,
  add constraint profiles_avatar_url_source
    check (
      avatar_url ~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/'
                    || id::text || '/[^/?#]+(\?[^#]*)?$')
      or avatar_url ~ '^https://lh[0-9]\.googleusercontent\.com/'
    ) not valid,
  add constraint profiles_cover_url_source
    check (
      cover_url ~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/banners/'
                   || id::text || '/[^/?#]+(\?[^#]*)?$')
    ) not valid;

-- Same approach as 20260905120000: validate against existing rows, and if any
-- old row unexpectedly fails, keep the constraints for new writes rather than
-- failing the whole migration.
do $$
begin
  alter table public.profiles validate constraint profiles_username_format;
  alter table public.profiles validate constraint profiles_full_name_length;
  alter table public.profiles validate constraint profiles_bio_length;
  alter table public.profiles validate constraint profiles_website_format;
  alter table public.profiles validate constraint profiles_avatar_url_source;
  alter table public.profiles validate constraint profiles_cover_url_source;
exception
  when check_violation then
    raise notice 'Existing profiles break the new rules. Constraints are active for new writes but not validated against history.';
end
$$;
