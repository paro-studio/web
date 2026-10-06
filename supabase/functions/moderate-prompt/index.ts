/**
 * moderate-prompt: checks a prompt's image for nudity, sexual content and
 * graphic violence as soon as it is posted or its image is replaced.
 *
 * Why it exists: the Community Guidelines rule these out, but until now the
 * only thing enforcing them was another user noticing and reporting. A public
 * gallery cannot wait for that.
 *
 * Why here and not in the apps: a check in the app is skipped by anyone who
 * posts through the API directly. This runs from a database trigger, after
 * the row exists, so there is no way to post around it.
 *
 * What it does with the answer from OpenAI's moderation model:
 *
 *   - clearly over the line (a high score for sexual content or graphic
 *     violence, or anything sexual involving minors): the prompt and its
 *     image are removed, and a message says so in Discord
 *   - flagged but not clearly: the prompt stays up and Discord gets a
 *     "needs a look" message with a link, for a person to decide
 *   - clean: nothing happens
 *
 * If the check itself fails (OpenAI is down, the key is wrong) nothing is
 * removed. A failed check must never take down an innocent post.
 *
 * How it is called: by two triggers on public.prompts. They are not in a
 * migration, because they carry the shared secret; create them once in the
 * SQL editor, with the project's own address and secret filled in:
 *
 *   create trigger moderate_new_prompt
 *     after insert on public.prompts
 *     for each row execute function supabase_functions.http_request(
 *       'https://<project ref>.supabase.co/functions/v1/moderate-prompt', 'POST',
 *       '{"Content-type":"application/json","x-webhook-secret":"<secret>"}',
 *       '{}', '10000');
 *
 *   create trigger moderate_changed_prompt_image
 *     after update of image_url on public.prompts
 *     for each row execute function supabase_functions.http_request(
 *       ... the same five arguments ... );
 *
 * "update of image_url" matters: it fires only when an update names that
 * column, so the counter triggers, which touch the row on every view and
 * like, do not call this. The triggers send
 *
 *   { "type": "INSERT" | "UPDATE", "table": "prompts",
 *     "record": { ... }, "old_record": { ... } }
 *
 * Who may call it: only those triggers. JWT verification is off (see
 * supabase/config.toml) and the x-webhook-secret header must equal
 * REPORT_WEBHOOK_SECRET, the same secret notify-report uses.
 *
 * Only the image's address is taken from our own row, read back by id, and
 * only if it is in our own prompt-images bucket, so this cannot be pointed at
 * some other address.
 *
 * Secrets, set once with `supabase secrets set`, never committed:
 *
 *   OPENAI_API_KEY                 an OpenAI API key; the moderation endpoint
 *                                  is free to call
 *   REPORT_WEBHOOK_SECRET          shared with notify-report
 *   DISCORD_REPORTS_WEBHOOK_URL    shared with notify-report; optional here,
 *                                  without it the check still runs silently
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY come from the runtime.
 *
 * Deploy: npx supabase functions deploy moderate-prompt
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_URL = "https://www.parostudios.in";
const BUCKET = "prompt-images";

/** At or above this score the image is removed without waiting for a person. */
const REMOVE_AT = 0.85;
/** Anything sexual involving minors is removed on far less. */
const REMOVE_MINORS_AT = 0.3;

/** The categories that can remove an image, with the score each needs. */
const REMOVABLE: Record<string, number> = {
  "sexual": REMOVE_AT,
  "violence/graphic": REMOVE_AT,
  "sexual/minors": REMOVE_MINORS_AT,
};

const RED = 0xb84a4a;
const GOLD = 0xc9a45c;

type Moderation = {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
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

/** User text made safe for Discord, which would otherwise render its markdown. */
const plain = (text: string) => text.replace(/([\\[\]()*_~`>|])/g, "\\$1");

const percent = (score: number) => `${Math.round(score * 100)}%`;

async function tellDiscord(embed: Record<string, unknown>) {
  const url = Deno.env.get("DISCORD_REPORTS_WEBHOOK_URL");
  if (!url) return;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allowed_mentions: { parse: [] }, embeds: [embed] }),
  });
  if (!response.ok) console.error(`Discord refused the moderation message: ${response.status}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Use POST" });

  const secret = Deno.env.get("REPORT_WEBHOOK_SECRET");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!secret || !openAiKey) {
    console.error("moderate-prompt is missing REPORT_WEBHOOK_SECRET or OPENAI_API_KEY");
    return reply(500, { error: "Not configured" });
  }

  if (!sameSecret(req.headers.get("x-webhook-secret") ?? "", secret)) {
    return reply(401, { error: "Not allowed" });
  }

  let payload: {
    type?: string;
    table?: string;
    record?: { id?: string; image_url?: string };
    old_record?: { image_url?: string } | null;
  };
  try {
    payload = await req.json();
  } catch {
    return reply(400, { error: "Expected JSON" });
  }

  const id = payload.record?.id;
  if (payload.table !== "prompts" || typeof id !== "string") {
    return reply(400, { error: "Expected a row from prompts" });
  }
  // An edit that kept the same picture has nothing new to check.
  if (payload.type === "UPDATE" && payload.old_record?.image_url === payload.record?.image_url) {
    return reply(200, { ok: "unchanged" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: prompt } = await admin
    .from("prompts")
    .select("id, user_id, title, image_url")
    .eq("id", id)
    .maybeSingle();
  if (!prompt) return reply(200, { ok: "gone" });

  const ownPrefix = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;
  if (!prompt.image_url.startsWith(ownPrefix)) {
    // Seed data and anything saved before links were restricted to our storage.
    return reply(200, { ok: "not ours to check" });
  }

  const check = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: [{ type: "image_url", image_url: { url: prompt.image_url } }],
    }),
  });

  if (!check.ok) {
    console.error(`Moderation check failed for ${id}: ${check.status}`, await check.text());
    return reply(502, { error: "The check could not be run. Nothing was removed." });
  }

  const result = ((await check.json()) as { results?: Moderation[] }).results?.[0];
  if (!result) return reply(502, { error: "The check returned nothing. Nothing was removed." });

  const scores = result.category_scores ?? {};
  const over = Object.entries(REMOVABLE)
    .filter(([category, limit]) => (scores[category] ?? 0) >= limit)
    .map(([category]) => category);

  if (over.length === 0 && !result.flagged) return reply(200, { ok: "clean" });

  const { data: creator } = await admin
    .from("profiles")
    .select("username, full_name")
    .eq("id", prompt.user_id)
    .maybeSingle();
  const by = creator?.username
    ? `@${plain(creator.username)}`
    : creator?.full_name
      ? plain(creator.full_name)
      : "someone without a username";

  const flaggedList =
    Object.entries(scores)
      .filter(([category, score]) => result.categories?.[category] || over.includes(category) || score >= 0.5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, score]) => `${category}: ${percent(score)}`)
      .join("\n") || "flagged, no category given";

  if (over.length === 0) {
    await tellDiscord({
      title: "A prompt needs a look",
      url: `${SITE_URL}/prompt/${prompt.id}`,
      color: GOLD,
      description: "The automatic check flagged this image but not strongly enough to remove it.",
      fields: [
        { name: "Prompt", value: `"${plain(prompt.title)}" by ${by}` },
        { name: "Scores", value: flaggedList },
        { name: "Open", value: `${SITE_URL}/prompt/${prompt.id}` },
      ],
      footer: { text: `prompts · ${prompt.id}` },
    });
    return reply(200, { ok: "sent for review" });
  }

  // Over the line. The row first: once it is gone the image is unreachable
  // from the app even if deleting the file then fails.
  const { error: deleteError } = await admin.from("prompts").delete().eq("id", prompt.id);
  if (deleteError) {
    console.error(`Could not remove prompt ${prompt.id}`, deleteError);
    await tellDiscord({
      title: "A prompt should be removed, and could not be",
      url: `${SITE_URL}/prompt/${prompt.id}`,
      color: RED,
      fields: [
        { name: "Prompt", value: `"${plain(prompt.title)}" by ${by}` },
        { name: "Scores", value: flaggedList },
        { name: "Open", value: `${SITE_URL}/prompt/${prompt.id}` },
      ],
      footer: { text: `prompts · ${prompt.id}` },
    });
    return reply(500, { error: "Could not remove the prompt" });
  }

  const path = prompt.image_url.slice(ownPrefix.length).split("?")[0];
  const { error: fileError } = await admin.storage.from(BUCKET).remove([path]);
  if (fileError) console.error(`Removed prompt ${prompt.id} but not its file ${path}`, fileError);

  await tellDiscord({
    title: "A prompt was removed automatically",
    color: RED,
    description: "Its image scored over the limit for content the Community Guidelines rule out.",
    fields: [
      { name: "Prompt", value: `"${plain(prompt.title)}" by ${by}` },
      { name: "Scores", value: flaggedList },
      { name: "Creator", value: `${SITE_URL}/profile/${prompt.user_id}` },
    ],
    footer: { text: `prompts · ${prompt.id}` },
  });

  return reply(200, { ok: "removed" });
});
