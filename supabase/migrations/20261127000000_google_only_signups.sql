-- Keep new accounts Google only, with one exception for Google Play review.
--
-- Google Play's reviewers could not sign in: Google asks "verify it's you"
-- when an account is used on a new phone, and their test phones are always
-- new. So the app gets a hidden email and password sign in, for one review
-- account. That needs Supabase's email provider switched on, which on its own
-- would let anyone create an email account through the API.
--
-- This hook stops that. Supabase Auth calls it before creating any user, and
-- it refuses email and phone sign ups unless the address is on the list
-- below. Google sign ups, and signing in to existing accounts, are untouched.
--
-- It does nothing until it is switched on in the dashboard:
-- Authentication > Hooks > Before User Created > Postgres >
-- public.hook_before_user_created. Switch it on BEFORE enabling the email
-- provider, so there is never a moment when email sign ups are open.

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  provider text := coalesce(event #>> '{user,app_metadata,provider}', '');
  email text := lower(btrim(coalesce(event #>> '{user,email}', '')));
begin
  -- The accounts allowed to sign in with an email and password. Only Google
  -- Play's review account. It is created by hand in the dashboard, already
  -- confirmed, so the address never needs a real inbox.
  if email = any (array['playreview@parostudios.in']) then
    return '{}'::jsonb;
  end if;

  if provider in ('email', 'phone') then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Paro accounts are created with Google. Use Continue with Google.'
      )
    );
  end if;

  -- Google, and anything else: allowed, so a surprise in the event's shape
  -- can never lock people out of signing up with Google.
  return '{}'::jsonb;
end;
$$;

-- Only Supabase Auth may call it.
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
