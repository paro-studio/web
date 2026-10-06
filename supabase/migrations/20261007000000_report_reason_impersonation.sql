-- Let a prompt be reported for showing a real person.
--
-- Paro's images are AI-made, and many start from a photo of a real face. That
-- is fine when the face is the poster's own. It is not when it is someone
-- else's: an AI image of a real person posted without their consent can be
-- impersonation, and a sexual or humiliating one is an offence. The Community
-- Guidelines and Terms now say so, and the person shown needs a direct way to
-- say "that is me".
--
-- user_reports has had 'impersonation' since 20261003000000, for accounts
-- pretending to be someone. This adds the same reason to prompt_reports, so
-- the report lands on the image itself rather than under 'other'.
--
-- The check on reason was declared inline in the first migration, so its
-- name was chosen by Postgres (normally prompt_reports_reason_check). Rather
-- than trust the name, drop whichever check on this table mentions the reason
-- list: a leftover old check would keep rejecting the new value even with the
-- new one in place. Replacing a check takes a brief lock on a small table,
-- and every existing row already passes the wider list.

do $$
declare
  old_check record;
begin
  for old_check in
    select conname
      from pg_constraint
     where conrelid = 'public.prompt_reports'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%misleading%'
  loop
    execute format('alter table public.prompt_reports drop constraint %I', old_check.conname);
  end loop;
end $$;

alter table public.prompt_reports
  add constraint prompt_reports_reason_check
    check (reason in ('spam','misleading','inappropriate','impersonation','copyright','other'));

-- Verification, signed in as any user:
--   insert into prompt_reports (user_id, prompt_id, reason)
--     values (auth.uid(), <a prompt id>, 'impersonation')   -> ok
--   ... reason 'nonsense'                                    -> 23514
