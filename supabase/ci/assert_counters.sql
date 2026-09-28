-- CI ONLY. Calls the view and copy counters and checks the throttling rules in
-- 20260915120000_throttle_prompt_counters.sql actually hold.
--
-- Everything runs inside one transaction that is rolled back, including the
-- temporary replacement of auth.uid() used to act as a signed in user.
--
-- now() is fixed for the whole transaction, so a repeat call always lands
-- inside the window. That is what these tests rely on.

\set ON_ERROR_STOP on

begin;

do $$
declare
  owner_id  uuid := gen_random_uuid();
  prompt_a  uuid;
  prompt_b  uuid;
  views     integer;
  copies    integer;
begin
  insert into auth.users (id) values (owner_id);
  insert into public.profiles (id, username, verified) values (owner_id, 'counter_test', true);

  insert into public.prompts (user_id, title, prompt, image_url, ai_tool)
  values (owner_id, 'A', 'prompt a', 'https://example.test/a.png', 'Midjourney')
  returning id into prompt_a;

  insert into public.prompts (user_id, title, prompt, image_url, ai_tool)
  values (owner_id, 'B', 'prompt b', 'https://example.test/b.png', 'Midjourney')
  returning id into prompt_b;

  -- Signed out: copies are ignored -----------------------------------------
  perform public.increment_copy_count(prompt_a);
  select copy_count into copies from public.prompts where id = prompt_a;
  if copies <> 0 then
    raise exception 'signed out copy must not count, copy_count = %', copies;
  end if;

  -- Signed out: one view per IP per prompt ---------------------------------
  perform set_config('request.headers', '{"x-forwarded-for": "203.0.113.1, 10.0.0.1"}', true);
  perform public.increment_view_count(prompt_a);
  perform public.increment_view_count(prompt_a);
  select view_count into views from public.prompts where id = prompt_a;
  if views <> 1 then
    raise exception 'repeat view from the same IP must count once, view_count = %', views;
  end if;

  perform set_config('request.headers', '{"x-forwarded-for": "203.0.113.2"}', true);
  perform public.increment_view_count(prompt_a);
  select view_count into views from public.prompts where id = prompt_a;
  if views <> 2 then
    raise exception 'a second IP must count, view_count = %', views;
  end if;

  if exists (select 1 from public.prompt_counter_events where actor like '%203.0.113%') then
    raise exception 'raw IP addresses must not be stored';
  end if;

  -- Signed out: hourly cap per prompt --------------------------------------
  for i in 1..40 loop
    perform set_config('request.headers', format('{"x-forwarded-for": "198.51.100.%s"}', i), true);
    perform public.increment_view_count(prompt_b);
  end loop;
  select view_count into views from public.prompts where id = prompt_b;
  if views <> 30 then
    raise exception 'signed out views must cap at 30 per prompt per hour, view_count = %', views;
  end if;

  -- Unknown prompt is a quiet no-op ----------------------------------------
  perform public.increment_view_count(gen_random_uuid());

  -- Signed in: one view and one copy per user per prompt -------------------
  execute format(
    'create or replace function auth.uid() returns uuid language sql stable as $f$ select %L::uuid $f$',
    owner_id
  );

  perform public.increment_view_count(prompt_a);
  perform public.increment_view_count(prompt_a);
  select view_count into views from public.prompts where id = prompt_a;
  if views <> 3 then
    raise exception 'signed in repeat view must count once, view_count = %', views;
  end if;

  perform public.increment_copy_count(prompt_a);
  perform public.increment_copy_count(prompt_a);
  select copy_count into copies from public.prompts where id = prompt_a;
  if copies <> 1 then
    raise exception 'signed in repeat copy must count once, copy_count = %', copies;
  end if;
end;
$$;

rollback;
