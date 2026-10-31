import { next } from "@vercel/functions";
import {
  fetchProfilePreview,
  fetchPromptPreview,
  isPreviewBot,
  isUuid,
  previewHtml,
  profileTags,
  promptTags,
  supabaseEnv,
} from "./src/lib/linkPreview.js";

export const config = { matcher: ["/prompt/:id", "/profile/:id"] };

// A preview that arrives late is useless, and the app's generic tags are fine.
const LOOKUP_TIMEOUT_MS = 1500;

/**
 * Gives link preview bots a page with the right title and image. Everyone else,
 * and every failure, carries on to the normal app untouched.
 */
export default async function middleware(request: Request): Promise<Response> {
  if (!isPreviewBot(request.headers.get("user-agent"))) return next();

  const [, section, id] = new URL(request.url).pathname.split("/");
  const env = supabaseEnv(process.env);
  if (!env || !isUuid(id)) return next();

  try {
    const signal = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
    let tags = null;
    if (section === "prompt") {
      const prompt = await fetchPromptPreview(env, id, signal);
      tags = prompt && promptTags(prompt);
    } else {
      const profile = await fetchProfilePreview(env, id, signal);
      tags = profile && profileTags(profile);
    }
    if (!tags) return next();

    return new Response(previewHtml(tags), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  } catch {
    return next();
  }
}
