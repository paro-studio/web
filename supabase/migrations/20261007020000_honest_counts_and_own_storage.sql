-- Four loose ends from the 2026-10-07 review, each a number or a link that the
-- person it belongs to could fake:
--
--   1. A creator could rate their own prompt.
--   2. A creator copying their own prompt raised its copy count, once a day,
--      which is what "Most copied" sorts by.
--   3. A signed out view was counted against the first address in the
--      x-forwarded-for header. Every proxy appends to that header, so the
--      first entry is whatever the caller typed. A fresh made up address per
--      request added 30 views an hour to any prompt, and the same 30 requests
--      used up the hour's signed out allowance for someone else's prompt.
--   4. Image links were accepted from any Supabase project. Someone could
--      point a prompt at a bucket in their own project: no size or type
--      limits, a picture they can swap after people liked it, and every
--      viewer's IP address in their logs.
--
-- Nobody using Paro normally meets any of this. Both apps already hide the
-- rating stars from a prompt's creator.

begin;

-- ---------------------------------------------------------------------------
-- 1. No rating your own prompt
-- ---------------------------------------------------------------------------

-- Before insert covers the apps' upsert too: Postgres runs this before it
-- looks for a conflict, so an existing self rating cannot be changed either.
create or replace function public.reject_self_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.prompts p
     where p.id = new.prompt_id and p.user_id = new.user_id
  ) then
    raise exception 'You cannot rate your own prompt.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_self_rating on public.prompt_ratings;
create trigger reject_self_rating
  before insert on public.prompt_ratings
  for each row execute function public.reject_self_rating();

-- Self ratings given before today come out, so the averages mean what they
-- say. The rating trigger recounts each prompt as its row goes.
delete from public.prompt_ratings pr
 using public.prompts p
 where p.id = pr.prompt_id
   and p.user_id = pr.user_id;

-- ---------------------------------------------------------------------------
-- 2. Copying your own prompt is not a copy
-- ---------------------------------------------------------------------------

create or replace function public.increment_copy_count(prompt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := increment_copy_count.prompt_id;
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;

  -- Not a prompt, or the caller's own.
  if not exists (select 1 from public.prompts p where p.id = target and p.user_id <> uid) then
    return;
  end if;

  if public.claim_prompt_counter(target, 'copy', 'u:' || uid::text, interval '24 hours') then
    update public.prompts p
       set copy_count = p.copy_count + 1
     where p.id = target;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Signed out views are counted against an address the caller cannot choose
-- ---------------------------------------------------------------------------

-- Supabase sits behind Cloudflare, which sets cf-connecting-ip to the real
-- client address and overwrites anything the caller sent under that name.
-- Where that header is missing, the LAST x-forwarded-for entry is the one
-- added by our own proxy; earlier entries are the caller's to invent. The
-- last entry can be a shared proxy address, which undercounts. Undercounting
-- a soft number is the safe way to be wrong; the old way could be driven up
-- at will.
create or replace function public.prompt_counter_actor()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  headers json;
  forwarded text[];
  ip text;
begin
  if uid is not null then
    return 'u:' || uid::text;
  end if;

  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    headers := null;
  end;

  ip := trim(coalesce(headers ->> 'cf-connecting-ip', ''));

  if ip = '' then
    forwarded := string_to_array(coalesce(headers ->> 'x-forwarded-for', ''), ',');
    ip := trim(coalesce(forwarded[array_length(forwarded, 1)], ''));
  end if;

  if ip = '' then
    ip := trim(coalesce(headers ->> 'x-real-ip', ''));
  end if;

  if ip = '' then
    return 'ip:unknown';
  end if;

  return 'ip:' || md5(ip);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Image links must be in this project's own storage
-- ---------------------------------------------------------------------------

-- Which host is "ours" differs per project, so it cannot be written into a
-- migration that contributors also run against their own Supabase projects.
-- It lives in one row instead. Production sets it once, by hand:
--
--   insert into public.app_config (key, value)
--   values ('storage_host', '<project ref>.supabase.co')
--   on conflict (key) do update set value = excluded.value;
--
-- With no row, any *.supabase.co host is accepted, as before, so a fresh
-- project works without setup.
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);

alter table public.app_config enable row level security;
-- No policies and no grants: nothing reads this through the API.
revoke all on public.app_config from anon, authenticated;

create or replace function public.own_storage_host()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select value from public.app_config where key = 'storage_host';
$$;

revoke all on function public.own_storage_host() from public, anon, authenticated;

-- The pattern a stored file's address must match: the configured host when
-- there is one, otherwise any Supabase project. Dots in the host are escaped
-- so they match only a dot.
create or replace function public.storage_url_pattern(bucket text, folder text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select '^https://'
      || coalesce(replace(public.own_storage_host(), '.', '\.'), '[a-z0-9-]+\.supabase\.co')
      || '/storage/v1/object/public/' || bucket || '/' || folder || '/[^/?#]+(\?[^#]*)?$';
$$;

revoke all on function public.storage_url_pattern(text, text) from public, anon;
grant execute on function public.storage_url_pattern(text, text) to authenticated;

-- Prompt images. Still security invoker: current_user has to be the caller.
create or replace function public.check_prompt_image_url()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.image_url !~ public.storage_url_pattern('prompt-images', new.user_id::text) then
    raise exception 'Prompt images must be uploaded through the app.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Avatars and banners. The table checks from 20260922120100 stay as the
-- outer rule (a Supabase address or a Google photo); a check cannot read a
-- table, so the host is narrowed here, and only when one of the two columns
-- is being written, never on a counter update.
create or replace function public.check_profile_image_urls()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.avatar_url is not null
     and new.avatar_url !~ '^https://lh[0-9]\.googleusercontent\.com/'
     and new.avatar_url !~ public.storage_url_pattern('avatars', new.id::text) then
    raise exception 'Profile photos must be uploaded through the app.'
      using errcode = '23514';
  end if;

  if new.cover_url is not null
     and new.cover_url !~ public.storage_url_pattern('banners', new.id::text) then
    raise exception 'Banners must be uploaded through the app.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists check_profile_image_urls on public.profiles;
create trigger check_profile_image_urls
  before insert or update of avatar_url, cover_url on public.profiles
  for each row execute function public.check_profile_image_urls();

commit;

-- Verification, signed in:
--   rate your own prompt                                    -> 23514
--   rpc increment_copy_count on your own prompt             -> count unchanged
--   with storage_host set, save an image_url on another
--     project's host                                        -> 23514
-- Signed out:
--   two rpc increment_view_count calls on one prompt with
--     different made up X-Forwarded-For values              -> one view at most
