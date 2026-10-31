-- Push notifications for ratings: when someone rates one of your prompts.
--
-- The send-push function records every notification it sends in
-- notification_events, and that table only accepted the three kinds there
-- were (follow, like, new_prompt). This adds 'rating', so a rating can be
-- recorded and the usual rules apply to it: never twice from the same person
-- about the same prompt, and at most one per prompt every ten minutes.
--
-- Only a new rating notifies. Changing your stars is an update, and the
-- trigger that calls send-push fires on insert only.
--
-- The trigger itself carries the shared secret, so it is created by hand in
-- the SQL editor, like push_on_follow and push_on_like. See send-push.

begin;

alter table public.notification_events
  drop constraint if exists notification_events_kind_check;

alter table public.notification_events
  add constraint notification_events_kind_check
  check (kind in ('follow', 'like', 'new_prompt', 'rating'));

commit;
