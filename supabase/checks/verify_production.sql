-- Production health check. Read only, changes nothing, safe to run any time.
--
-- CI proves the migrations run. This proves the database they were supposed to
-- produce actually looks that way. Those are different questions, and the gap
-- between them is where the September 2026 privilege holes lived: schema.sql
-- said one thing, production did another, and nothing compared them.
--
-- Run it in the Supabase SQL Editor after any schema change, or with:
--   psql '<pooler connection string>' -f supabase/checks/verify_production.sql
--
-- Every row must say PASS. Anything else, read the detail column.

with checks as (

  -- 1 ----------------------------------------------------------------------
  select
    1 as ord,
    'RLS enabled on every public table' as check_name,
    case when count(*) = 0 then 'PASS' else 'FAIL' end as status,
    coalesce(string_agg(c.relname, ', '), 'all 9 enabled') as detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in ('profiles', 'prompts', 'likes', 'saves', 'follows',
                      'feedback', 'prompt_ratings', 'prompt_reports', 'prompt_uploads')
    and not c.relrowsecurity

  union all

  -- 2 ----------------------------------------------------------------------
  select
    2,
    'profiles.verified is not client writable',
    case when not (
         has_column_privilege('authenticated', 'public.profiles', 'verified', 'INSERT')
      or has_column_privilege('authenticated', 'public.profiles', 'verified', 'UPDATE')
      or has_column_privilege('anon',          'public.profiles', 'verified', 'INSERT')
      or has_column_privilege('anon',          'public.profiles', 'verified', 'UPDATE')
    ) then 'PASS' else 'FAIL' end,
    'anyone could self-verify if this fails'

  union all

  -- 3 ----------------------------------------------------------------------
  select
    3,
    'prompt counters are not client writable',
    case when not (
         has_column_privilege('authenticated', 'public.prompts', 'view_count', 'INSERT')
      or has_column_privilege('authenticated', 'public.prompts', 'view_count', 'UPDATE')
      or has_column_privilege('authenticated', 'public.prompts', 'copy_count', 'INSERT')
      or has_column_privilege('authenticated', 'public.prompts', 'copy_count', 'UPDATE')
      or has_column_privilege('anon',          'public.prompts', 'view_count', 'UPDATE')
      or has_column_privilege('anon',          'public.prompts', 'copy_count', 'UPDATE')
    ) then 'PASS' else 'FAIL' end,
    'the trending feed sorts on view_count'

  union all

  -- 4 ----------------------------------------------------------------------
  -- The inverse of 2 and 3. Over-revoking breaks the app silently, with a
  -- runtime 42501 that no test catches, so check the app can still write.
  select
    4,
    'app can still write its own columns',
    case when (
          has_column_privilege('authenticated', 'public.profiles', 'username',   'UPDATE')
      and has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'UPDATE')
      and has_column_privilege('authenticated', 'public.profiles', 'cover_url',  'UPDATE')
      and has_column_privilege('authenticated', 'public.profiles', 'bio',        'UPDATE')
      and has_column_privilege('authenticated', 'public.prompts',  'title',      'UPDATE')
      and has_column_privilege('authenticated', 'public.prompts',  'tags',       'UPDATE')
      and has_column_privilege('authenticated', 'public.prompts',  'image_url',  'INSERT')
    ) then 'PASS' else 'FAIL' end,
    'if this fails, profile or prompt editing is broken'

  union all

  -- 5 ----------------------------------------------------------------------
  select
    5,
    'storage buckets have size and MIME limits',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    coalesce(string_agg(id, ', '), 'all 3 limited')
  from storage.buckets
  where file_size_limit is null
     or allowed_mime_types is null

  union all

  -- 6 ----------------------------------------------------------------------
  select
    6,
    'counter functions are still security definer',
    case when count(*) = 2 then 'PASS' else 'FAIL' end,
    count(*)::text || ' of 2 (counters stop incrementing if this fails)'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('increment_view_count', 'increment_copy_count')
    and p.prosecdef

  union all

  -- 7 ----------------------------------------------------------------------
  select
    7,
    'migration history is recorded',
    case when count(*) >= 2 then 'PASS' else 'FAIL' end,
    count(*)::text || ' migrations applied'
  from supabase_migrations.schema_migrations

)
select check_name, status, detail
from checks
order by ord;
