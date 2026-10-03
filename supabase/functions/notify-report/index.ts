/**
 * notify-report: posts a message to a private Discord channel whenever
 * someone reports a prompt or an account.
 *
 * Why it exists: reports land in prompt_reports and user_reports, which
 * nobody can read through the API, so the only way to see one was to open
 * the Supabase dashboard and look. Google Play expects reports to be acted
 * on, and a report nobody knows about is not acted on.
 *
 * How it is called: by two Database Webhooks (Dashboard > Database >
 * Webhooks), one on INSERT into each table. They send the new row as
 *
 *   { "type": "INSERT", "table": "prompt_reports", "schema": "public",
 *     "record": { ... } }
 *
 * Who may call it: nobody but those webhooks. A database webhook has no
 * signed in user, so JWT verification is off for this function (see
 * supabase/config.toml), and it checks a shared secret instead: the webhooks
 * send it in the x-webhook-secret header and it must equal
 * REPORT_WEBHOOK_SECRET. Without that, anyone could post made up reports
 * into the channel.
 *
 * The message never trusts the request for more than the row's id. It reads
 * the report back from the database, so a caller cannot invent its contents,
 * and looks up the names that make it readable: who reported, which prompt
 * or account, and a link to open it.
 *
 * Secrets, set once with `supabase secrets set`, never committed:
 *
 *   DISCORD_REPORTS_WEBHOOK_URL   the channel's webhook URL
 *   REPORT_WEBHOOK_SECRET         any long random string
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY come from the runtime.
 *
 * Deploy: npx supabase functions deploy notify-report
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_URL = "https://www.parostudios.in";
const TABLES = ["prompt_reports", "user_reports"] as const;
type ReportTable = (typeof TABLES)[number];

/** Discord's limit for an embed field value. */
const FIELD_MAX = 1024;
/** Paro's destructive red, as Discord wants it. */
const RED = 0xb84a4a;

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

const handle = (profile: { username: string | null; full_name: string | null } | null) =>
  profile?.username ? `@${profile.username}` : profile?.full_name || "someone without a username";

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Use POST" });

  const secret = Deno.env.get("REPORT_WEBHOOK_SECRET");
  const discordUrl = Deno.env.get("DISCORD_REPORTS_WEBHOOK_URL");
  if (!secret || !discordUrl) {
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

  const table = TABLES.find((name) => name === payload.table) as ReportTable | undefined;
  const id = payload.record?.id;
  if (payload.type !== "INSERT" || !table || typeof id !== "string") {
    return reply(400, { error: "Expected an INSERT on a reports table" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const profileOf = async (userId: string) => {
    const { data } = await admin
      .from("profiles")
      .select("username, full_name")
      .eq("id", userId)
      .maybeSingle();
    return data;
  };

  let title: string;
  let subject: string;
  let link: string;
  let report: { user_id: string; reason: string; details: string | null; created_at: string };

  if (table === "prompt_reports") {
    const { data, error } = await admin
      .from("prompt_reports")
      .select("user_id, prompt_id, reason, details, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return reply(404, { error: "No such report" });
    report = data;

    const { data: prompt } = await admin
      .from("prompts")
      .select("title, user_id")
      .eq("id", data.prompt_id)
      .maybeSingle();
    const owner = prompt ? await profileOf(prompt.user_id) : null;

    title = "A prompt was reported";
    subject = prompt ? `"${prompt.title}" by ${handle(owner)}` : "A prompt that has since been deleted";
    link = `${SITE_URL}/prompt/${data.prompt_id}`;
  } else {
    const { data, error } = await admin
      .from("user_reports")
      .select("user_id, reported_id, reason, details, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return reply(404, { error: "No such report" });
    report = data;

    title = "An account was reported";
    subject = handle(await profileOf(data.reported_id));
    link = `${SITE_URL}/profile/${data.reported_id}`;
  }

  const reporter = handle(await profileOf(report.user_id));

  const discord = await fetch(discordUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // Names and details are written by users. Nothing in them may ping
      // anyone, so @everyone in a report's details is just text.
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title,
          url: link,
          color: RED,
          timestamp: report.created_at,
          fields: [
            { name: "Reported", value: clip(subject) },
            { name: "Reason", value: clip(report.reason), inline: true },
            { name: "Reported by", value: clip(reporter), inline: true },
            ...(report.details ? [{ name: "Details", value: clip(report.details) }] : []),
            { name: "Open", value: link },
          ],
          footer: { text: `${table} · ${id}` },
        },
      ],
    }),
  });

  if (!discord.ok) {
    console.error(`Discord refused the report message: ${discord.status}`, await discord.text());
    return reply(502, { error: "Discord did not accept the message" });
  }

  return reply(200, { ok: "sent" });
});
