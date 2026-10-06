/**
 * moderate-prompt: checks a prompt's image and its words as soon as it is
 * posted or edited, for nudity, sexual content, graphic violence, self-harm,
 * and anything sexual involving minors.
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
 *   - over a "remove" line: the prompt and its image are removed, and a
 *     message says so in Discord
 *   - over a "review" line only: the prompt stays up and Discord gets a
 *     "needs a look" message with a link, for a person to decide
 *   - under both: nothing happens
 *
 * The lines themselves, one per category, for the image and for the text,
 * are in policy.ts beside this file, with the reason for each number. The
 * image and the text are checked separately, because the same category means
 * different things for each: a prompt describing a battle is not a picture
 * of one.
 *
 * If a check itself fails (OpenAI is down, the key is wrong, the image cannot
 * be read) nothing is removed, because a failed check must never take down
 * an innocent post. It is not waved through either: Discord is asked for a
 * person to look.
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
 * Everything checked is read back from our own row by id. The image is only
 * sent if it is in our own prompt-images bucket, so this cannot be pointed at
 * some other address. The prompt text goes to OpenAI for the check and
 * nowhere else; it is never put in the Discord message.
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

import { judge } from "./policy.ts";

const SITE_URL = "https://www.parostudios.in";
const BUCKET = "prompt-images";

const RED = 0xb84a4a;
const GOLD = 0xc9a45c;

type Scores = Record<string, number>;
type Row = { id?: string; image_url?: string; title?: string; prompt?: string | null; tags?: string[] | null };

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

/** One input's scores from OpenAI, or null when the check could not be run. */
async function scoresFor(key: string, input: Record<string, unknown>, what: string): Promise<Scores | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "omni-moderation-latest", input: [input] }),
    });
    if (!response.ok) {
      console.error(`The ${what} check failed: ${response.status}`, await response.text());
      return null;
    }
    const result = ((await response.json()) as { results?: { category_scores?: Scores }[] }).results?.[0];
    return result?.category_scores ?? null;
  } catch (error) {
    console.error(`The ${what} check could not be reached`, error);
    return null;
  }
}

/**
 * The image as OpenAI wants it when it is handed over rather than fetched:
 * a data: address holding the bytes. Null if we cannot read it either.
 */
async function asDataUrl(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "image/jpeg";
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    // In pieces: one call with millions of arguments overflows the stack.
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return `data:${type};base64,${btoa(binary)}`;
  } catch (error) {
    console.error("Could not read the image to hand it over", error);
    return null;
  }
}

/**
 * The image's scores. OpenAI normally fetches the picture from its address,
 * but sometimes cannot (a scan of the gallery found one such file), and an
 * image that cannot be checked must not simply stay up unchecked. So on
 * failure the bytes are read here and sent directly.
 */
async function imageScoresFor(key: string, imageUrl: string): Promise<Scores | null> {
  const byAddress = await scoresFor(key, { type: "image_url", image_url: { url: imageUrl } }, "image");
  if (byAddress) return byAddress;

  const dataUrl = await asDataUrl(imageUrl);
  if (!dataUrl) return null;
  return scoresFor(key, { type: "image_url", image_url: { url: dataUrl } }, "image, sent directly");
}

const sameTags = (a?: string[] | null, b?: string[] | null) => (a ?? []).join("\n") === (b ?? []).join("\n");

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

  let payload: { type?: string; table?: string; record?: Row; old_record?: Row | null };
  try {
    payload = await req.json();
  } catch {
    return reply(400, { error: "Expected JSON" });
  }

  const id = payload.record?.id;
  if (payload.table !== "prompts" || typeof id !== "string") {
    return reply(400, { error: "Expected a row from prompts" });
  }

  // A new prompt gets both checks. An edit only rechecks what it changed, so
  // saving the form with nothing altered asks OpenAI nothing.
  const before = payload.type === "UPDATE" ? payload.old_record : null;
  const after = payload.record!;
  const imageChanged = !before || before.image_url !== after.image_url;
  const textChanged =
    !before || before.title !== after.title || before.prompt !== after.prompt || !sameTags(before.tags, after.tags);
  if (!imageChanged && !textChanged) return reply(200, { ok: "unchanged" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: prompt } = await admin
    .from("prompts")
    .select("id, user_id, title, prompt, tags, image_url")
    .eq("id", id)
    .maybeSingle();
  if (!prompt) return reply(200, { ok: "gone" });

  // Seed data and anything saved before links were restricted to our storage
  // has an image elsewhere; that one is not ours to send.
  const ownPrefix = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;
  const ownImage = prompt.image_url.startsWith(ownPrefix);
  const words = [prompt.title, (prompt.tags ?? []).join(", "), prompt.prompt ?? ""].join("\n").trim();

  const [imageScores, textScores] = await Promise.all([
    imageChanged && ownImage ? imageScoresFor(openAiKey, prompt.image_url) : undefined,
    textChanged && words ? scoresFor(openAiKey, { type: "text", text: words }, "text") : undefined,
  ]);

  const image = judge("image", imageScores ?? undefined);
  const text = judge("text", textScores ?? undefined);
  const remove = [...image.remove, ...text.remove];
  const review = [...image.review, ...text.review];
  // null is a check that was due and failed; undefined is one that was not due.
  const failed = imageScores === null || textScores === null;

  // A check that could not be run removes nothing, but it is not "clean"
  // either: a person is asked to look, or an image OpenAI cannot read would
  // be a way to post anything.
  if (failed) {
    review.push(`the ${imageScores === null ? "image" : "text"} could not be checked automatically`);
  }

  if (remove.length === 0 && review.length === 0) return reply(200, { ok: "clean" });

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

  const link = `${SITE_URL}/prompt/${prompt.id}`;
  const about = { name: "Prompt", value: `"${plain(prompt.title)}" by ${by}` };
  const why = { name: "Why", value: [...remove, ...review].join("\n") };
  const footer = { text: `prompts · ${prompt.id}` };

  if (remove.length === 0) {
    await tellDiscord({
      title: "A prompt needs a look",
      url: link,
      color: GOLD,
      description: "The automatic check noticed something, but not enough to remove it.",
      fields: [about, why, { name: "Open", value: link }],
      footer,
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
      url: link,
      color: RED,
      fields: [about, why, { name: "Open", value: link }],
      footer,
    });
    return reply(500, { error: "Could not remove the prompt" });
  }

  if (ownImage) {
    const path = prompt.image_url.slice(ownPrefix.length).split("?")[0];
    const { error: fileError } = await admin.storage.from(BUCKET).remove([path]);
    if (fileError) console.error(`Removed prompt ${prompt.id} but not its file ${path}`, fileError);
  }

  await tellDiscord({
    title: "A prompt was removed automatically",
    color: RED,
    description: "It scored over a limit for content the Community Guidelines rule out.",
    fields: [about, why, { name: "Creator", value: `${SITE_URL}/profile/${prompt.user_id}` }],
    footer,
  });

  return reply(200, { ok: "removed" });
});
