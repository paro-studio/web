/**
 * What WhatsApp, X, Discord and the like see when a Paro link is shared.
 *
 * They read the first HTML from the server and never run our JavaScript, so
 * the tags in index.html are all they would ever get. middleware.ts answers
 * them with these instead. Runs outside the Vite build, so no `@/` imports and
 * no import.meta.env here.
 */

export const SITE_URL = "https://www.parostudios.in";
export const GENERIC_IMAGE = `${SITE_URL}/og-image.png`;

const PREVIEW_BOTS =
  /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|pinterest|redditbot|applebot/i;

export function isPreviewBot(userAgent: string | null | undefined): boolean {
  return PREVIEW_BOTS.test(userAgent ?? "");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined): value is string {
  return UUID.test(value ?? "");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Same short names the cards use. Anything else is a custom tool, shown as typed.
const TOOL_LABELS: Record<string, string> = {
  "NANO BANANA (Gemini)": "Nano Banana",
  "DALL-E 3 (ChatGPT)": "DALL·E",
};

export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool;
}

export interface PromptPreview {
  id: string;
  title: string;
  imageUrl: string;
  tool: string;
  tags: string[];
  creatorName: string;
  verified: boolean;
}

export interface ProfilePreview {
  id: string;
  name: string;
  username: string | null;
  bio: string | null;
}

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export function supabaseEnv(env: Record<string, string | undefined>): SupabaseEnv | null {
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

async function firstRow<T>(env: SupabaseEnv, query: string, signal?: AbortSignal): Promise<T | null> {
  const response = await fetch(`${env.url}/rest/v1/${query}`, {
    headers: { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}` },
    signal,
  });
  if (!response.ok) return null;
  const rows = (await response.json()) as T[];
  return rows[0] ?? null;
}

interface PromptRow {
  id: string;
  title: string;
  image_url: string;
  ai_tool: string;
  tags: string[] | null;
  creator: { username: string | null; full_name: string | null; verified: boolean | null } | null;
}

/**
 * Named columns only. Signed out, a select that includes `prompt` fails, and
 * the prompt text must never reach a preview anyway.
 */
export async function fetchPromptPreview(
  env: SupabaseEnv,
  id: string,
  signal?: AbortSignal
): Promise<PromptPreview | null> {
  const select = "id,title,image_url,ai_tool,tags,creator:profiles!prompts_user_id_fkey(username,full_name,verified)";
  const row = await firstRow<PromptRow>(env, `prompts?id=eq.${id}&select=${select}&limit=1`, signal);
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    imageUrl: row.image_url,
    tool: toolLabel(row.ai_tool),
    tags: row.tags ?? [],
    creatorName: row.creator?.full_name || row.creator?.username || "a Paro creator",
    verified: row.creator?.verified ?? false,
  };
}

interface ProfileRow {
  id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
}

export async function fetchProfilePreview(
  env: SupabaseEnv,
  id: string,
  signal?: AbortSignal
): Promise<ProfilePreview | null> {
  const row = await firstRow<ProfileRow>(env, `profiles?id=eq.${id}&select=id,username,full_name,bio&limit=1`, signal);
  if (!row) return null;

  return { id: row.id, name: row.full_name || row.username || "A Paro creator", username: row.username, bio: row.bio };
}

/** Older rows can point at images elsewhere. Only ours get fetched. */
export function isOwnImage(env: SupabaseEnv, imageUrl: string): boolean {
  return imageUrl.startsWith(`${env.url}/storage/v1/object/public/prompt-images/`);
}

export interface PreviewTags {
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
  imageWidth?: number;
  imageHeight?: number;
}

export function promptTags(prompt: PromptPreview): PreviewTags {
  const title = `${prompt.title} by ${prompt.creatorName}`;
  const details = [`${prompt.tool} prompt`, prompt.tags.slice(0, 3).join(", "), "on Paro"].filter(Boolean);

  return {
    title,
    description: details.join(" · "),
    url: `${SITE_URL}/prompt/${prompt.id}`,
    image: `${SITE_URL}/api/og/prompt/${prompt.id}`,
    imageAlt: title,
    imageWidth: 1200,
    imageHeight: 630,
  };
}

export function profileTags(profile: ProfilePreview): PreviewTags {
  const title = profile.username ? `${profile.name} (@${profile.username}) on Paro` : `${profile.name} on Paro`;
  const bio = profile.bio?.trim();

  return {
    title,
    description: bio ? bio.slice(0, 200) : `See the AI prompts ${profile.name} shares on Paro.`,
    url: `${SITE_URL}/profile/${profile.id}`,
    image: GENERIC_IMAGE,
    imageAlt: "Paro Studio — create and share AI prompts",
    imageWidth: 1200,
    imageHeight: 630,
  };
}

/** The whole page a preview bot gets. Everything user written is escaped here. */
export function previewHtml(tags: PreviewTags): string {
  const e = escapeHtml;
  const size =
    tags.imageWidth && tags.imageHeight
      ? `<meta property="og:image:width" content="${tags.imageWidth}" /><meta property="og:image:height" content="${tags.imageHeight}" />`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${e(tags.title)}</title>
<meta name="description" content="${e(tags.description)}" />
<link rel="canonical" href="${e(tags.url)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Paro Studio" />
<meta property="og:title" content="${e(tags.title)}" />
<meta property="og:description" content="${e(tags.description)}" />
<meta property="og:url" content="${e(tags.url)}" />
<meta property="og:image" content="${e(tags.image)}" />
<meta property="og:image:alt" content="${e(tags.imageAlt)}" />
${size}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${e(tags.title)}" />
<meta name="twitter:description" content="${e(tags.description)}" />
<meta name="twitter:image" content="${e(tags.image)}" />
<meta name="twitter:image:alt" content="${e(tags.imageAlt)}" />
</head>
<body><h1>${e(tags.title)}</h1><p>${e(tags.description)}</p><a href="${e(tags.url)}">Open on Paro</a></body>
</html>`;
}
