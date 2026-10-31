-- Profile photos and banners are checked by moderation when uploaded.
--
-- Prompts have been checked since 20261007020000, but a profile photo or
-- banner never was. They cannot be checked from the profiles row: a new
-- photo replaces the file at the same address ({user id}/avatar.jpg), so the
-- row need not change at all. So this watches storage itself. Every write to
-- avatars or banners by a signed in user asks the moderate-profile-image
-- Edge Function to look at the file, the same way request_push asks send-push
-- (20261021010000), with the address and secret from Vault.
--
-- Each check costs a call to OpenAI and may post to Discord, so a person can
-- write at most 10 profile pictures a day between the two buckets. The 11th
-- upload is refused with P0001.
--
-- Writes with no signed in user (the dashboard, the Edge Functions' own
-- clean up) are not checked or counted. Where Vault or pg_net is missing
-- (CI, a local database) the limit still applies and the call is skipped.

begin;

create table if not exists public.profile_image_events (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists profile_image_events_user_idx
  on public.profile_image_events (user_id, created_at desc);

alter table public.profile_image_events enable row level security;
revoke all on public.profile_image_events from anon, authenticated;

create or replace function public.request_profile_image_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := auth.uid();
  made     integer;
  base_url text;
  secret   text;
begin
  if uid is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext('profile_images:' || uid::text));

  delete from public.profile_image_events
   where user_id = uid
     and created_at < now() - interval '2 days';

  select count(*) into made
    from public.profile_image_events
   where user_id = uid
     and created_at >= now() - interval '24 hours';

  if made >= 10 then
    raise exception 'Daily limit on profile pictures reached. Try again tomorrow.'
      using errcode = 'P0001';
  end if;

  insert into public.profile_image_events (user_id) values (uid);

  if to_regclass('vault.decrypted_secrets') is null
     or to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    return null;
  end if;

  select s.decrypted_secret into base_url
    from vault.decrypted_secrets s where s.name = 'paro_functions_url';
  select s.decrypted_secret into secret
    from vault.decrypted_secrets s where s.name = 'paro_webhook_secret';
  if base_url is null or secret is null then
    return null;
  end if;

  perform net.http_post(
    url := base_url || '/moderate-profile-image',
    body := jsonb_build_object('bucket', new.bucket_id, 'name', new.name),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', secret
    ),
    timeout_milliseconds := 10000
  );

  return null;
end;
$$;

revoke all on function public.request_profile_image_check() from public, anon, authenticated;

drop trigger if exists check_new_profile_image on storage.objects;
create trigger check_new_profile_image
  after insert on storage.objects
  for each row
  when (new.bucket_id in ('avatars', 'banners'))
  execute function public.request_profile_image_check();

-- Replacing a photo in place is an update that gives the object a new
-- version. Other updates (metadata touched by Storage itself) are not new
-- pictures. Only where the column exists: CI's stand-in table has no version.
drop trigger if exists check_replaced_profile_image on storage.objects;
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'storage' and table_name = 'objects' and column_name = 'version'
  ) then
    create trigger check_replaced_profile_image
      after update on storage.objects
      for each row
      when (new.bucket_id in ('avatars', 'banners') and new.version is distinct from old.version)
      execute function public.request_profile_image_check();
  end if;
end $$;

commit;
