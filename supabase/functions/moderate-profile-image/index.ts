/**
 * moderate-profile-image: checks a profile photo or banner as soon as it is
 * uploaded, with the same image rules moderate-prompt uses for prompts.
 *
 * Why it exists: prompts were checked, but a profile photo or banner never
 * was, so the one picture shown next to everything a person posts could be
 * anything. And a profile photo is replaced in place, at the same address,
 * so watching the profiles row would not see a new picture. This is called
 * from storage itself, whenever a file in avatars or banners is written.
 *
 * What it does with the answer, as moderate-prompt does:
 *
 *   - over a "remove" line: the file is deleted, the profile goes back to no
 *     photo (or no banner), and Discord is told
 *   - over a "review" line only: it stays, and Discord gets a "needs a look"
 *   - a check that could not be run: nothing removed, Discord asked to look
 *
 * How it is called: by public.request_profile_image_check(), a trigger on
 * storage.objects (migration 20261021020000), with the address and the
 * secret from Vault. It sends { "bucket": "avatars" | "banners", "name":
 * "<user id>/avatar.jpg" }. The same migration caps uploads at 10 a day per
 * person, since each one costs a check.
 *
 * Who may call it: only that trigger. JWT verification is off (see
 * supabase/config.toml) and the x-webhook-secret header must equal
 * REPORT_WEBHOOK_SECRET. The picture is read from storage here, by its name,
 * and only the two fixed names in the two buckets are accepted.
 *
 * Secrets: OPENAI_API_KEY, REPORT_WEBHOOK_SECRET, and optionally
 * DISCORD_REPORTS_WEBHOOK_URL, all shared with moderate-prompt. SUPABASE_URL
 * and SUPABASE_SERVICE_ROLE_KEY come from the runtime.
 *
 * Deploy: npx supabase functions deploy moderate-profile-image
 */

import { createClient } from "npm:@supabase/supabase-js@2";

import { judge } from "../moderate-prompt/policy.ts";

const SITE_URL = "https://www.parostudios.in";

const RED = 0xb84a4a;
const GOLD = 0xc9a45c;

/** Which file each bucket may hold, and which profile column points at it. */
const BUCKETS = {
  avatars: { file: "avatar.jpg", column: "avatar_url", what: "profile photo" },
  banners: { file: "banner.jpg", column: "cover_url", what: "banner" },
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

/** The picture's scores from OpenAI, or null when the check could not be run. */
async function scoresFor(key: string, bytes: Blob): Promise<Record<string, number> | null> {
  try {
    const data = new Uint8Array(await bytes.arrayBuffer());
    let binary = "";
    // In pieces: one call with millions of arguments overflows the stack.
    for (let i = 0; i < data.length; i += 0x8000) {
      binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
    }
    const dataUrl = `data:${bytes.type || "image/jpeg"};base64,${btoa(binary)}`;

    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input: [{ type: "image_url", image_url: { url: dataUrl } }],
      }),
    });
    if (!response.ok) {
      console.error(`The profile image check failed: ${response.status}`, await response.text());
      return null;
    }
    const result = ((await response.json()) as { results?: { category_scores?: Record<string, number> }[] })
      .results?.[0];
    return result?.category_scores ?? null;
  } catch (error) {
    console.error("The profile image check could not be run", error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Use POST" });

  const secret = Deno.env.get("REPORT_WEBHOOK_SECRET");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!secret || !openAiKey) {
    console.error("moderate-profile-image is missing REPORT_WEBHOOK_SECRET or OPENAI_API_KEY");
    return reply(500, { error: "Not configured" });
  }

  if (!sameSecret(req.headers.get("x-webhook-secret") ?? "", secret)) {
    return reply(401, { error: "Not allowed" });
  }

  let payload: { bucket?: string; name?: string };
  try {
    payload = await req.json();
  } catch {
    return reply(400, { error: "Expected JSON" });
  }

  const bucket = payload.bucket as keyof typeof BUCKETS;
  const rules = BUCKETS[bucket];
  const [userId, file, ...deeper] = (payload.name ?? "").split("/");
  if (!rules || !UUID.test(userId ?? "") || file !== rules.file || deeper.length > 0) {
    return reply(400, { error: "Expected a profile photo or banner" });
  }
  const name = `${userId}/${file}`;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Read straight from storage, not the public address, which a CDN might
  // answer with the picture this one replaced.
  const { data: bytes, error: downloadError } = await admin.storage.from(bucket).download(name);
  if (downloadError || !bytes) {
    // Replaced or deleted again before this ran: that newer write has its own check.
    return reply(200, { ok: "gone" });
  }

  const scores = await scoresFor(openAiKey, bytes);
  const { remove, review } = judge("image", scores ?? undefined);
  if (scores === null) review.push("the image could not be checked automatically");
  if (remove.length === 0 && review.length === 0) return reply(200, { ok: "clean" });

  const { data: profile } = await admin
    .from("profiles")
    .select("username, full_name, avatar_url, cover_url")
    .eq("id", userId)
    .maybeSingle();
  const who = profile?.username
    ? `@${plain(profile.username)}`
    : profile?.full_name
      ? plain(profile.full_name)
      : "someone without a username";
  const link = `${SITE_URL}/profile/${userId}`;
  const fields = [
    { name: "Account", value: `${who}\n${link}` },
    { name: "Why", value: [...remove, ...review].join("\n") },
  ];
  const footer = { text: `${bucket} · ${name}` };

  if (remove.length === 0) {
    await tellDiscord({
      title: `A ${rules.what} needs a look`,
      url: link,
      color: GOLD,
      description: "The automatic check noticed something, but not enough to remove it.",
      fields,
      footer,
    });
    return reply(200, { ok: "sent for review" });
  }

  const { error: removeError } = await admin.storage.from(bucket).remove([name]);
  if (removeError) {
    console.error(`Could not remove ${bucket}/${name}`, removeError);
    await tellDiscord({
      title: `A ${rules.what} should be removed, and could not be`,
      url: link,
      color: RED,
      fields,
      footer,
    });
    return reply(500, { error: "Could not remove the file" });
  }

  // Only if the profile actually shows this file. A Google photo, kept from
  // the first sign in, stays.
  const shown = profile?.[rules.column] as string | null | undefined;
  if (shown && shown.split("?")[0].endsWith(`/storage/v1/object/public/${bucket}/${name}`)) {
    const { error } = await admin.from("profiles").update({ [rules.column]: null }).eq("id", userId);
    if (error) console.error(`Removed ${bucket}/${name} but the profile still points at it`, error);
  }

  await tellDiscord({
    title: `A ${rules.what} was removed automatically`,
    url: link,
    color: RED,
    description: "It scored over a limit for content the Community Guidelines rule out.",
    fields,
    footer,
  });

  return reply(200, { ok: "removed" });
});
