/**
 * notify-report: posts a message to a private Discord channel whenever
 * someone reports a prompt or an account, or sends feedback.
 *
 * Why it exists: reports land in prompt_reports and user_reports, and
 * feedback in feedback, and nobody can read any of the three through the
 * API. The only way to see one was to open the Supabase dashboard and look.
 * Google Play expects reports to be acted on, and a report nobody knows
 * about is not acted on. Feedback had the same problem: it was written down
 * and never read.
 *
 * How it is called: by Database Webhooks (Dashboard > Integrations >
 * Database Webhooks), one on INSERT into each table. They send the new row
 * as
 *
 *   { "type": "INSERT", "table": "prompt_reports", "schema": "public",
 *     "record": { ... } }
 *
 * When creating a hook, pick this function in the Edge Function dropdown. It
 * defaults to the first function in the list, which is not this one.
 *
 * Who may call it: nobody but those webhooks. A database webhook has no
 * signed in user, so JWT verification is off for this function (see
 * supabase/config.toml), and it checks a shared secret instead: the webhooks
 * send it in the x-webhook-secret header and it must equal
 * REPORT_WEBHOOK_SECRET. Without that, anyone could post made up reports
 * into the channel.
 *
 * The message never trusts the request for more than the row's id. It reads
 * the row back from the database, so a caller cannot invent its contents,
 * and looks up the names that make it readable: who sent it, which prompt or
 * account it is about, and a link to open.
 *
 * Secrets, set once with `supabase secrets set`, never committed:
 *
 *   DISCORD_REPORTS_WEBHOOK_URL    the reports channel's webhook URL
 *   DISCORD_FEEDBACK_WEBHOOK_URL   optional: a separate channel for feedback.
 *                                  Without it, feedback goes to the reports
 *                                  channel
 *   REPORT_WEBHOOK_SECRET          any long random string
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY come from the runtime.
 *
 * Deploy: npx supabase functions deploy notify-report
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const SITE_URL = "https://www.parostudios.in";
const TABLES = ["prompt_reports", "user_reports", "feedback"] as const;
type Table = (typeof TABLES)[number];

/** Discord's limit for an embed field value. */
const FIELD_MAX = 1024;
/** Paro's destructive red and its gold, as Discord wants them. */
const RED = 0xb84a4a;
const GOLD = 0xc9a45c;

type Field = { name: string; value: string; inline?: boolean };
type Message = {
  title: string;
  url: string;
  color: number;
  timestamp: string;
  fields: Field[];
};

function reply(status: number, body: Record<string, string>) {
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

const clip = (text: string, max = FIELD_MAX) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * Text written by users, made safe to show. Discord renders markdown, so a
 * title or a report's details could otherwise carry a masked link such as
 * [Open in dashboard](https://somewhere.else) that looks like part of the
 * alert to the person moderating.
 */
const plain = (text: string) => text.replace(/([\\[\]()*_~`>|])/g, "\\$1");

// Usernames are letters, digits and underscores, so only the underscore
// needs care. A display name is free text.
const handle = (profile: { username: string | null; full_name: string | null } | null) =>
  profile?.username
    ? `@${plain(profile.username)}`
    : profile?.full_name
      ? plain(profile.full_name)
      : "someone without a username";

const promptUrl = (id: string) => `${SITE_URL}/prompt/${id}`;
const profileUrl = (id: string) => `${SITE_URL}/profile/${id}`;

async function profileOf(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("profiles")
    .select("username, full_name")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

/** The message for one row, or null when there is no such row. */
async function describe(admin: SupabaseClient, table: Table, id: string): Promise<Message | null> {
  if (table === "prompt_reports") {
    const { data } = await admin
      .from("prompt_reports")
      .select("user_id, prompt_id, reason, details, created_at")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;

    const { data: prompt } = await admin
      .from("prompts")
      .select("title, user_id")
      .eq("id", data.prompt_id)
      .maybeSingle();
    const owner = prompt ? await profileOf(admin, prompt.user_id) : null;
    const link = promptUrl(data.prompt_id);

    return {
      title: "A prompt was reported",
      url: link,
      color: RED,
      timestamp: data.created_at,
      fields: [
        {
          name: "Reported",
          value: prompt
            ? `"${plain(prompt.title)}" by ${handle(owner)}`
            : "A prompt that has since been deleted",
        },
        { name: "Reason", value: data.reason, inline: true },
        { name: "Reported by", value: handle(await profileOf(admin, data.user_id)), inline: true },
        ...(data.details ? [{ name: "Details", value: plain(data.details) }] : []),
        { name: "Open", value: link },
      ],
    };
  }

  if (table === "user_reports") {
    const { data } = await admin
      .from("user_reports")
      .select("user_id, reported_id, reason, details, created_at")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const link = profileUrl(data.reported_id);

    return {
      title: "An account was reported",
      url: link,
      color: RED,
      timestamp: data.created_at,
      fields: [
        { name: "Reported", value: handle(await profileOf(admin, data.reported_id)) },
        { name: "Reason", value: data.reason, inline: true },
        { name: "Reported by", value: handle(await profileOf(admin, data.user_id)), inline: true },
        ...(data.details ? [{ name: "Details", value: plain(data.details) }] : []),
        { name: "Open", value: link },
      ],
    };
  }

  const { data } = await admin
    .from("feedback")
    .select("user_id, subject, message, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const link = profileUrl(data.user_id);

  return {
    title: "New feedback",
    url: link,
    color: GOLD,
    timestamp: data.created_at,
    fields: [
      { name: "Subject", value: plain(data.subject || "(none)") },
      { name: "Message", value: plain(data.message || "(empty)") },
      { name: "From", value: `${handle(await profileOf(admin, data.user_id))}\n${link}` },
    ],
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Use POST" });

  const secret = Deno.env.get("REPORT_WEBHOOK_SECRET");
  const reportsUrl = Deno.env.get("DISCORD_REPORTS_WEBHOOK_URL");
  if (!secret || !reportsUrl) {
    console.error("notify-report is missing REPORT_WEBHOOK_SECRET or DISCORD_REPORTS_WEBHOOK_URL");
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

  const table = TABLES.find((name) => name === payload.table);
  const id = payload.record?.id;
  if (payload.type !== "INSERT" || !table || typeof id !== "string") {
    return reply(400, { error: "Expected an INSERT on a reports or feedback table" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const message = await describe(admin, table, id);
  if (!message) return reply(404, { error: "No such row" });

  const discordUrl =
    table === "feedback" ? Deno.env.get("DISCORD_FEEDBACK_WEBHOOK_URL") || reportsUrl : reportsUrl;

  const body = JSON.stringify({
      // Names, details and feedback are written by users. Nothing in them may
      // ping anyone, so @everyone in a message is just text.
      allowed_mentions: { parse: [] },
      embeds: [
        {
          ...message,
          fields: message.fields.map((field) => ({ ...field, value: clip(field.value) })),
          footer: { text: `${table} · ${id}` },
        },
      ],
  });

  const send = () =>
    fetch(discordUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body });

  // Discord takes about 30 messages a minute per webhook and answers 429
  // past that, saying how long to wait. Wait once, within reason, so a burst
  // does not cost a real report its alert.
  let discord = await send();
  if (discord.status === 429) {
    const wait = Number((await discord.json().catch(() => ({})))?.retry_after ?? 1);
    await new Promise((done) => setTimeout(done, Math.min(Math.max(wait, 0.5), 4) * 1000));
    discord = await send();
  }

  if (!discord.ok) {
    console.error(`Discord refused the ${table} message: ${discord.status}`, await discord.text());
    return reply(502, { error: "Discord did not accept the message" });
  }

  return reply(200, { ok: "sent" });
});
