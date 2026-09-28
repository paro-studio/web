-- Make the prompt text sign in only (issue #79).
--
-- The product rule is that you get a prompt by signing in and copying it. The
-- app hid the text on screen, but the anon role could read prompts.prompt, so
-- anyone could pull every prompt from the API, or GraphQL, or simply from the
-- feed's own requests, without an account.
--
-- anon keeps every other column, so signed out visitors can still browse the
-- feed and open prompt pages. Signed in users keep full read. The app now lists
-- its columns explicitly and only asks for `prompt` when signed in, see
-- src/services/supabase/prompts.ts. It has to: once anon lacks a column, a
-- signed out select('*') on prompts fails outright rather than skipping it.
--
-- Same revoke then grant pattern as 20260905000000. A column level revoke does
-- nothing while a table level grant exists, and revoking the table privilege
-- also drops the column ones, so the allowed columns are granted back one by
-- one. pg_graphql follows these privileges, so the GraphQL endpoint stops
-- exposing the column to anon as well.
--
-- A new column on prompts is not readable by anon until it is added here. That
-- is deliberate: new prompt data stays private unless someone decides otherwise.

revoke select on public.prompts from anon;

grant select (id, user_id, title, image_url, ai_tool, tags, view_count,
              copy_count, created_at, updated_at)
  on public.prompts to anon;
