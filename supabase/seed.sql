-- PARO Studio sample data
--
-- Optional. Run this only in your own development project, never against
-- production. It gives you a populated feed so you can actually see the UI.
--
-- Order matters:
--   1. Run supabase/schema.sql
--   2. Sign up in the app and pick a username
--   3. Run this file
--
-- It attaches everything to the most recently created account, so there is no
-- user id to copy anywhere. Sign up first or it will tell you to.
--
-- Images come from picsum.photos, a free placeholder service. Nothing here is
-- real user data and nothing comes from parostudios.in. The app only accepts
-- prompt images from your own storage bucket, but that rule applies to the API,
-- not the SQL editor, so these placeholders still go in.
--
-- Safe to run more than once. It clears its own sample rows first.

do $$
declare
  seed_user uuid;
begin

  select id into seed_user
  from auth.users
  order by created_at desc
  limit 1;

  if seed_user is null then
    raise exception 'No user found. Sign up in the app first, then run this file again.';
  end if;

  -- Make the account verified so the badge is visible, and fill in the profile
  -- if it is still blank. coalesce means a profile you already set up is left
  -- alone.
  --
  -- Avatar and banner are left alone. The database only accepts images from
  -- your own storage bucket, or a Google photo for the avatar, so a placeholder
  -- URL would be rejected. Signing in with Google already gives you an avatar,
  -- and you can upload a banner from Settings.
  update public.profiles
  set
    verified   = true,
    full_name  = coalesce(full_name, 'Paro Demo'),
    bio        = coalesce(bio, 'Sample account for local development.')
  where id = seed_user;

  -- Remove sample rows from a previous run so this stays repeatable. Only
  -- touches prompts created by this file, matched on the placeholder host.
  delete from public.prompts
  where user_id = seed_user
    and image_url like 'https://picsum.photos/seed/paro-prompt-%';

  insert into public.prompts (user_id, title, prompt, image_url, ai_tool, tags, view_count, copy_count)
  values
    (
      seed_user,
      'Golden hour rooftop portrait',
      'portrait of a woman on a city rooftop at golden hour, warm rim lighting, shallow depth of field, 85mm lens, soft film grain',
      'https://picsum.photos/seed/paro-prompt-1/800/1000',
      'NANO BANANA (Gemini)',
      array['portrait', 'lighting', 'aesthetic'],
      412, 37
    ),
    (
      seed_user,
      'Minimal product shot on concrete',
      'matte black ceramic mug on a raw concrete surface, single soft window light from the left, deep shadows, minimal composition, product photography',
      'https://picsum.photos/seed/paro-prompt-2/800/800',
      'Midjourney',
      array['product shot', 'minimal', 'lighting'],
      289, 54
    ),
    (
      seed_user,
      'Rain-soaked neon street',
      'narrow city street at night after rain, neon signage reflecting in puddles, one figure walking away from camera, cinematic wide shot, teal and magenta grade',
      'https://picsum.photos/seed/paro-prompt-3/800/1100',
      'Stable Diffusion',
      array['cinematic', 'landscape', 'aesthetic'],
      903, 118
    ),
    (
      seed_user,
      'Retro travel poster, coastal cliffs',
      'vintage travel poster of coastal cliffs at sunset, flat screen-print texture, limited palette of cream orange and deep blue, bold sans serif title',
      'https://picsum.photos/seed/paro-prompt-4/800/1100',
      'DALL-E 3 (ChatGPT)',
      array['vintage', 'movie poster', 'landscape'],
      156, 12
    ),
    (
      seed_user,
      'Editorial fashion, brutalist stairwell',
      'full body editorial fashion shot in a brutalist concrete stairwell, oversized tailored coat, hard directional light, muted grey palette, shot on medium format',
      'https://picsum.photos/seed/paro-prompt-5/800/1000',
      'Leonardo AI',
      array['fashion', 'photoshoot', 'minimal'],
      634, 71
    ),
    (
      seed_user,
      'Storm giant above the treeline',
      'colossal storm giant made of cloud and lightning standing over a pine forest, dawn light breaking through, epic scale, painterly fantasy illustration',
      'https://picsum.photos/seed/paro-prompt-6/800/1200',
      'Firefly',
      array['fantasy', 'superhero', 'cinematic'],
      1247, 203
    );

  raise notice 'Seeded 6 prompts for user %. Reload the app.', seed_user;

end $$;
