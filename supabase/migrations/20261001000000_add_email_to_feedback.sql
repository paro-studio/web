-- Add email tracking to feedback table for audit trail and email notifications.
--
-- Stores the user's email at the time of submission for:
-- 1. Email delivery tracking (sent to parostudio2026@gmail.com via Edge Function)
-- 2. Audit trail (know who submitted what, even if profile is deleted)
-- 3. Future reply-to capability (contact the submitter if needed)
--
-- The email is denormalized (also exists in auth.users) for resilience: if a
-- user deletes their account, this row preserves who submitted feedback.
--
-- Safe to run multiple times (uses if not exists).

alter table public.feedback
  add column if not exists user_email text;

-- Add a check constraint to ensure valid email format (basic)
-- This mirrors what the frontend validates with Zod
alter table public.feedback
  add constraint if not exists feedback_user_email_format
    check (user_email IS NULL OR user_email ~ '^\S+@\S+\.\S+$');

-- Add an index for querying feedback by email (useful for support)
create index if not exists feedback_user_email_idx on public.feedback (user_email);

-- Update column comment for documentation
comment on column public.feedback.user_email is 'Email of the user who submitted feedback. Denormalized from auth.users for audit trail.';
