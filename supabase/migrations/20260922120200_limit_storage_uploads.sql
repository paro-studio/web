-- Limit what signed in users can put in the storage buckets.
--
-- The upload policies only checked that a file went into the user's own
-- folder. Nothing checked the file name or how many files there were, so any
-- signed in user could upload as many images as they liked to all three
-- buckets, and all three are public. That is free image hosting, and on the
-- free plan's 1 GB it is enough for one person to fill storage and break
-- uploads for everyone.
--
--   avatars, banners   the app only ever writes {user_id}/avatar.jpg and
--                      {user_id}/banner.jpg, overwriting in place. Those are
--                      now the only names allowed
--   prompt-images      each file belongs to a prompt, so a user may hold at
--                      most as many files as they have prompts, plus a small
--                      allowance for an upload whose prompt is still being
--                      saved, or an edit whose old image is not yet deleted
--
-- Checked against production on 2026-09-22: avatars and banners only contain
-- those two names, and no user has more than one prompt image beyond their
-- prompt count.
--
-- These replace the policies from 20260101000000 of the same names. Only the
-- insert and update checks change. Read and delete stay as they were.

-- avatars --------------------------------------------------------------------

drop policy if exists "Users can upload own avatar" on storage.objects;
create policy "Users can upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name = (auth.uid())::text || '/avatar.jpg'
  );

drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and name = (auth.uid())::text || '/avatar.jpg'
  );

-- banners --------------------------------------------------------------------

drop policy if exists "Users can upload own banner" on storage.objects;
create policy "Users can upload own banner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'banners'
    and name = (auth.uid())::text || '/banner.jpg'
  );

drop policy if exists "Users can update own banner" on storage.objects;
create policy "Users can update own banner"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'banners'
    and (auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'banners'
    and name = (auth.uid())::text || '/banner.jpg'
  );

-- prompt-images --------------------------------------------------------------

-- True while the caller holds fewer prompt images than their prompt count plus
-- five. Security definer so it can count every file in the folder, not just the
-- ones the caller's own read policy would show.
create or replace function public.prompt_image_quota_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)
       from storage.objects o
      where o.bucket_id = 'prompt-images'
        and (storage.foldername(o.name))[1] = (auth.uid())::text)
    <
    (select count(*)
       from public.prompts p
      where p.user_id = auth.uid()) + 5;
$$;

revoke all on function public.prompt_image_quota_ok() from public, anon;
grant execute on function public.prompt_image_quota_ok() to authenticated;

drop policy if exists "Users can upload own prompt images" on storage.objects;
create policy "Users can upload own prompt images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'prompt-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
    and public.prompt_image_quota_ok()
  );
