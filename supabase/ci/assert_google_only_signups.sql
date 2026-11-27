-- CI ONLY. Checks the sign up hook from 20261127000000: email and phone sign
-- ups are refused except for the review account, Google sign ups pass, and
-- only Supabase Auth can call it. Everything is rolled back.

\set ON_ERROR_STOP on

begin;

do $$
declare
  hook text := 'public.hook_before_user_created(jsonb)';
  result jsonb;

  -- The event Supabase Auth sends, cut down to the parts the hook reads.
  event constant text := '{"user": {"email": "%s", "app_metadata": {"provider": "%s"}}}';
begin
  -- 1. Who may call it.
  if has_function_privilege('anon', hook, 'EXECUTE')
     or has_function_privilege('authenticated', hook, 'EXECUTE') then
    raise exception 'the sign up hook must not be callable from the API';
  end if;
  if not has_function_privilege('supabase_auth_admin', hook, 'EXECUTE') then
    raise exception 'Supabase Auth must be able to call the sign up hook';
  end if;

  -- 2. A stranger signing up with an email is refused, with a 403.
  result := public.hook_before_user_created(format(event, 'someone@example.com', 'email')::jsonb);
  if (result #>> '{error,http_code}') is distinct from '403' then
    raise exception 'an email sign up must be refused, got %', result;
  end if;

  -- 3. The same with a phone number.
  result := public.hook_before_user_created(format(event, '', 'phone')::jsonb);
  if result ? 'error' is not true then
    raise exception 'a phone sign up must be refused, got %', result;
  end if;

  -- 4. The review account is allowed, however its address is typed.
  result := public.hook_before_user_created(format(event, '  PlayReview@ParoStudios.in ', 'email')::jsonb);
  if result <> '{}'::jsonb then
    raise exception 'the review account must be allowed, got %', result;
  end if;

  -- 5. Google sign ups pass.
  result := public.hook_before_user_created(format(event, 'riya@gmail.com', 'google')::jsonb);
  if result <> '{}'::jsonb then
    raise exception 'a Google sign up must be allowed, got %', result;
  end if;

  -- 6. An event with no provider at all is let through, so an unexpected
  --    shape can never block Google sign ups.
  result := public.hook_before_user_created('{"user": {}}'::jsonb);
  if result <> '{}'::jsonb then
    raise exception 'an event without a provider must be allowed, got %', result;
  end if;
end;
$$;

rollback;
