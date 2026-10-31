-- Profile picture checks: find the uploader from the file, not the session.
--
-- 20261021020000 took the uploader from auth.uid(), and skipped writes with
-- no signed in user. But Storage checks the upload as the user and then
-- writes the file over its own connection, where auth.uid() is empty, so
-- every real upload was skipped. Storage records who uploaded a file in
-- owner_id (owner on older projects), which is used here when there is no
-- session. A file with neither, such as one added in the dashboard, is still
-- skipped.

begin;

create or replace function public.request_profile_image_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Read through jsonb, so a Storage without one of the columns still works.
  uid      uuid := coalesce(
    auth.uid(),
    nullif(to_jsonb(new) ->> 'owner_id', '')::uuid,
    nullif(to_jsonb(new) ->> 'owner', '')::uuid
  );
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

commit;
