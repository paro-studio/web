-- Add image_width and image_height columns to public.prompts.
--
-- Feed images have no intrinsic width or height set on their <img> tags, so
-- the browser does not know how much vertical space to reserve in the feed
-- before the image finishes downloading. When each image lands, layout reflows
-- and pushes content down (Cumulative Layout Shift, CLS).
--
-- Storing dimensions at upload time allows the frontend to set width and height
-- attributes on the <img> tag while keeping CSS `w-full h-auto` scaling.
-- The browser derives the aspect ratio from width/height and reserves the
-- exact space in advance, eliminating CLS.

begin;

alter table public.prompts
  add column if not exists image_width integer default null,
  add column if not exists image_height integer default null;

alter table public.prompts
  add constraint prompts_image_width_positive
    check (image_width is null or (image_width > 0 and image_width <= 10000)),
  add constraint prompts_image_height_positive
    check (image_height is null or (image_height > 0 and image_height <= 10000));

-- Allow anon and authenticated to read, insert, and update image dimensions.
grant select (image_width, image_height) on public.prompts to anon;
grant insert (image_width, image_height) on public.prompts to anon, authenticated;
grant update (image_width, image_height) on public.prompts to anon, authenticated;

commit;
