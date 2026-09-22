-- Length caps on prompts table text columns
--
-- prompts.title and prompts.prompt had no length check constraint.
-- 
-- The limits are set above what the UI allows, so they act as an abuse
-- backstop rather than a second copy of the form's validation. The form caps
-- title at 100 characters and the prompt textarea at 15000.
--
-- `not valid` skips the check against existing rows. New and updated rows are
-- still checked. The tables should have nothing near these limits, but a
-- migration that fails on old data is worse than one that starts from here.

alter table public.prompts
  add constraint prompts_title_length check (char_length(title) <= 250) not valid;

alter table public.prompts
  add constraint prompts_prompt_length check (char_length(prompt) <= 20000) not valid;

-- Turn the checks into full constraints if the existing rows pass, which they
-- should. Wrapped so an unexpectedly long historic row leaves the constraint
-- in place for new writes rather than failing the whole migration.
do $$
begin
  alter table public.prompts validate constraint prompts_title_length;
  alter table public.prompts validate constraint prompts_prompt_length;
exception
  when check_violation then
    raise notice 'Existing rows exceed the new length limits. Constraints are active for new writes but not validated against history.';
end
$$;
