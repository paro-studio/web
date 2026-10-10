/**
 * send-push: sends a push notification to the mobile app when someone
 * follows a person, likes their prompt, or when a creator they follow posts.
 *
 * How it is called:
 *
 *   - by two triggers, on insert into public.follows and public.likes. Like
 *     the moderation triggers they carry the shared secret, so they are
 *     created once in the SQL editor and are not in a migration:
 *
 *       create trigger push_on_follow
 *         after insert on public.follows
 *         for each row execute function supabase_functions.http_request(
 *           'https://<project ref>.supabase.co/functions/v1/send-push', 'POST',
 *           '{"Content-type":"application/json","x-webhook-secret":"<secret>"}',
 *           '{}', '10000');
 *
 *       create trigger push_on_like
 *         after insert on public.likes
 *         for each row execute function supabase_functions.http_request(
 *           ... the same five arguments ... );
 *
 *   - by the moderate-prompt function, for a new prompt, once its image has
 *     been checked and left up. Followers are not told about a post that is
 *     about to be removed.
 *
 * Each sends { "type": "INSERT", "table": "...", "record": { "id": ... } }.
 *
 * Who may call it: only those. JWT verification is off (see
 * supabase/config.toml) and the x-webhook-secret header must equal
 * REPORT_WEBHOOK_SECRET, the secret notify-report and moderate-prompt use.
 * The row is read back from the database by id, so a caller cannot invent a
 * follow or a like that never happened.
 *
 * Who is not told:
 *
 *   - yourself, about your own like or post
 *   - someone who has blocked the person doing it
 *   - someone already told the same thing: unfollowing and following again,
 *     or unliking and liking again, does not buzz a second time. A prompt
 *     also sends at most one like notification every ten minutes, so a
 *     popular post is not twenty buzzes in a row
 *
 * What was sent is recorded in notification_events, which is how the rules
 * above are checked. Delivery goes through Expo's push service; a phone it
 * reports as gone has its token removed.
 *
 * Secrets: REPORT_WEBHOOK_SECRET. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * come from the runtime. Expo's push service needs no key.
 *
 * Deploy: npx supabase functions deploy send-push
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Expo accepts up to 100 messages per request. */
const BATCH = 100;
/** One like notification per prompt in this window. */
const LIKE_QUIET_MS = 10 * 60 * 1000;
/** Titles are cut to this in a notification body, which shows a line or two. */
const BODY_MAX = 120;

type Kind = "follow" | "like" | "new_prompt";

/** One thing to tell some people about. */
type Notice = {
  kind: Kind;
  actorId: string;
  promptId: string | null;
  recipientIds: string[];
  title: string;
  body: string;
  /** Where a tap goes, as a path in the app. */
  url: string;
};

function reply(status: number, body: Record<string, string | number>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Compares in constant time, so the secret cannot be guessed a character at a time. */
function sameSecret(given: string, expected: string) {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

const clip = (text: string) => (text.length > BODY_MAX ? `${text.slice(0, BODY_MAX - 1)}…` : text);

async function nameOf(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("profiles")
    .select("username, full_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.username ? `@${data.username}` : data?.full_name || "Someone";
}

/** Reads the row the trigger fired for and works out who should hear about it. */
async function noticeFor(admin: SupabaseClient, table: string, id: string): Promise<Notice | null> {
  if (table === "follows") {
    const { data } = await admin
      .from("follows")
      .select("follower_id, following_id")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;

    return {
      kind: "follow",
      actorId: data.follower_id,
      promptId: null,
      recipientIds: [data.following_id],
      title: "New follower",
      body: `${await nameOf(admin, data.follower_id)} started following you`,
      url: `/profile/${data.follower_id}`,
    };
  }

  if (table === "likes") {
    const { data } = await admin
      .from("likes")
      .select("user_id, prompt_id")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;

    const { data: prompt } = await admin
      .from("prompts")
      .select("user_id, title")
      .eq("id", data.prompt_id)
      .maybeSingle();
    if (!prompt) return null;

    return {
      kind: "like",
      actorId: data.user_id,
      promptId: data.prompt_id,
      recipientIds: [prompt.user_id],
      title: `${await nameOf(admin, data.user_id)} liked your prompt`,
      body: clip(prompt.title),
      url: `/prompt/${data.prompt_id}`,
    };
  }

  if (table === "prompts") {
    const { data: prompt } = await admin
      .from("prompts")
      .select("user_id, title")
      .eq("id", id)
      .maybeSingle();
    if (!prompt) return null;

    const { data: followers } = await admin
      .from("follows")
      .select("follower_id")
      .eq("following_id", prompt.user_id);

    return {
      kind: "new_prompt",
      actorId: prompt.user_id,
      promptId: id,
      recipientIds: (followers ?? []).map((row) => row.follower_id),
      title: `${await nameOf(admin, prompt.user_id)} posted a new prompt`,
      body: clip(prompt.title),
      url: `/prompt/${id}`,
    };
  }

  return null;
}

/** Drops everyone who should not be told, by the rules in the header. */
async function whoToTell(admin: SupabaseClient, notice: Notice): Promise<string[]> {
  let recipients = [...new Set(notice.recipientIds)].filter((id) => id !== notice.actorId);
  if (recipients.length === 0) return [];

  // Anyone who blocked the person doing this.
  const { data: blocks } = await admin
    .from("blocks")
    .select("blocker_id")
    .eq("blocked_id", notice.actorId)
    .in("blocker_id", recipients);
  const blockedBy = new Set((blocks ?? []).map((row) => row.blocker_id));
  recipients = recipients.filter((id) => !blockedBy.has(id));
  if (recipients.length === 0) return [];

  // Anyone already told this by the same person.
  let already = admin
    .from("notification_events")
    .select("recipient_id")
    .eq("kind", notice.kind)
    .eq("actor_id", notice.actorId)
    .in("recipient_id", recipients);
  already = notice.promptId ? already.eq("prompt_id", notice.promptId) : already.is("prompt_id", null);
  const { data: told } = await already;
  const toldAlready = new Set((told ?? []).map((row) => row.recipient_id));
  recipients = recipients.filter((id) => !toldAlready.has(id));
  if (recipients.length === 0) return [];

  // A prompt's likes are spaced out, whoever they come from.
  if (notice.kind === "like" && notice.promptId) {
    const { data: recent } = await admin
      .from("notification_events")
      .select("recipient_id")
      .eq("kind", "like")
      .eq("prompt_id", notice.promptId)
      .in("recipient_id", recipients)
      .gte("created_at", new Date(Date.now() - LIKE_QUIET_MS).toISOString());
    const quiet = new Set((recent ?? []).map((row) => row.recipient_id));
    recipients = recipients.filter((id) => !quiet.has(id));
  }

  return recipients;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Use POST" });

  const secret = Deno.env.get("REPORT_WEBHOOK_SECRET");
  if (!secret) {
    console.error("send-push is missing REPORT_WEBHOOK_SECRET");
    return reply(500, { error: "Not configured" });
  }
  if (!sameSecret(req.headers.get("x-webhook-secret") ?? "", secret)) {
    return reply(401, { error: "Not allowed" });
  }

  let payload: { type?: string; table?: string; record?: { id?: string } };
  try {
    payload = await req.json();
  } catch {
    return reply(400, { error: "Expected JSON" });
  }

  const id = payload.record?.id;
  if (payload.type !== "INSERT" || typeof payload.table !== "string" || typeof id !== "string") {
    return reply(400, { error: "Expected an INSERT with a row id" });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const notice = await noticeFor(admin, payload.table, id);
  if (!notice) return reply(200, { ok: "nothing to send" });

  const recipients = await whoToTell(admin, notice);
  if (recipients.length === 0) return reply(200, { ok: "nobody to tell" });

  // Recorded before sending: if two calls race, the second finds these rows
  // and stays quiet. A notification that then fails to send is a missed
  // buzz; the other way round would be a repeated one.
  const { error: recordError } = await admin.from("notification_events").insert(
    recipients.map((recipientId) => ({
      recipient_id: recipientId,
      actor_id: notice.actorId,
      kind: notice.kind,
      prompt_id: notice.promptId,
    })),
  );
  if (recordError) console.error("Could not record what is being sent", recordError);

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("token")
    .in("user_id", recipients);
  const addresses = (tokens ?? []).map((row) => row.token);
  if (addresses.length === 0) return reply(200, { ok: "no phones to send to" });

  let sent = 0;
  const gone: string[] = [];

  for (let from = 0; from < addresses.length; from += BATCH) {
    const batch = addresses.slice(from, from + BATCH);
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(
          batch.map((to) => ({
            to,
            title: notice.title,
            body: notice.body,
            data: { url: notice.url },
            sound: "default",
            channelId: "default",
          })),
        ),
      });

      if (!response.ok) {
        console.error(`Expo refused a batch: ${response.status}`, await response.text());
        continue;
      }

      const tickets = ((await response.json()) as {
        data?: { status: string; details?: { error?: string } }[];
      }).data ?? [];
      tickets.forEach((ticket, index) => {
        if (ticket.status === "ok") sent += 1;
        // The app was uninstalled, or its token has been replaced.
        else if (ticket.details?.error === "DeviceNotRegistered") gone.push(batch[index]);
      });
    } catch (error) {
      console.error("Could not reach Expo's push service", error);
    }
  }

  if (gone.length > 0) {
    const { error } = await admin.from("push_tokens").delete().in("token", gone);
    if (error) console.error("Could not remove tokens for phones that are gone", error);
  }

  return reply(200, { ok: "sent", phones: sent });
});
