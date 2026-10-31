import { readFile } from "node:fs/promises";
import satori from "satori";
import sharp from "sharp";
import { GENERIC_IMAGE, fetchPromptPreview, isOwnImage, isUuid, supabaseEnv } from "../../../src/lib/linkPreview.js";
import type { PromptPreview } from "../../../src/lib/linkPreview.js";

const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 40;
const IMAGE_MAX_WIDTH = 500;
const IMAGE_MAX_HEIGHT = HEIGHT - MARGIN * 2;
const GAP = 52;
const LOGO_WIDTH = 28;
const TEXT_WIDTH = WIDTH - MARGIN - IMAGE_MAX_WIDTH - GAP - 64;

// Rendered once, then served from the CDN. Short enough that a removed prompt
// drops out soon, and the stale window keeps popular links fast.
// Vercel kills the function at 10s (vercel.json), and then no fallback can run.
// All downloads share this budget, leaving the rest for layout and encoding.
const NETWORK_BUDGET_MS = 7000;

const CACHE = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

const COLORS = {
  background: "#0d0f12",
  foreground: "#efe6d8",
  muted: "#ad9a74",
  gold: "#d4af70",
  onGold: "#0d0f12",
  verified: "#1d9bf0",
};

const VERIFIED_TICK = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${COLORS.verified}"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
)}`;

const asset = (path: string) => readFile(new URL(`../../${path}`, import.meta.url));

type Element = { type: string; props: Record<string, unknown> };

function el(type: string, style: Record<string, unknown>, ...children: (Element | string | null)[]): Element {
  return { type, props: { style: { display: "flex", ...style }, children } };
}

function img(src: string, width: number, height: number, style: Record<string, unknown> = {}): Element {
  return { type: "img", props: { src, width, height, style } };
}

// Our fonts only cover Latin. Fetch whatever a title or name needs on top.
const NOTO_FONTS: Record<string, string> = {
  devanagari: "Noto Sans Devanagari",
  arabic: "Noto Sans Arabic",
  "ja-JP": "Noto Sans JP",
  "ko-KR": "Noto Sans KR",
  "zh-CN": "Noto Sans SC",
  "zh-TW": "Noto Sans TC",
};

async function loadAdditionalAsset(languageCode: string, segment: string, signal: AbortSignal) {
  try {
    if (languageCode === "emoji") {
      const codePoints = [...segment]
        .map((char) => char.codePointAt(0)!.toString(16))
        .filter((code) => code !== "fe0f")
        .join("-");
      const response = await fetch(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${codePoints}.svg`, { signal });
      if (!response.ok) return "";
      const svg = Buffer.from(await response.arrayBuffer()).toString("base64");
      return `data:image/svg+xml;base64,${svg}`;
    }

    // Satori can pass several guesses, like "ja-JP|ko-KR|zh-CN", for shared characters.
    const name = NOTO_FONTS[languageCode.split("|")[0]] ?? "Noto Sans";
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}&text=${encodeURIComponent(segment)}`,
      { signal }
    ).then((response) => response.text());
    const fontUrl = css.match(/src: url\((.+?)\)/)?.[1];
    if (!fontUrl) return [];
    const font = await fetch(fontUrl, { signal });
    if (!font.ok) return [];
    // Unique names: each download only holds these characters, and fonts sharing
    // a name would hide each other.
    return [{ name: `${name} ${segment}`, data: await font.arrayBuffer(), weight: 400 as const, style: "normal" as const }];
  } catch {
    // A missing character is better than no card.
    return languageCode === "emoji" ? "" : [];
  }
}

function titleSize(title: string): number {
  if (title.length <= 18) return 72;
  if (title.length <= 40) return 58;
  return 46;
}

/** The whole picture, never cropped, as a JPEG the renderer can read (it can't read WebP). */
async function promptImage(url: string, deadline: AbortSignal) {
  const response = await fetch(url, { signal: AbortSignal.any([deadline, AbortSignal.timeout(5000)]) });
  if (!response.ok) throw new Error(`Image responded ${response.status}`);

  const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
    .rotate()
    .resize(IMAGE_MAX_WIDTH, IMAGE_MAX_HEIGHT, { fit: "inside" })
    .flatten({ background: COLORS.background })
    .jpeg({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  return { src: `data:image/jpeg;base64,${data.toString("base64")}`, width: info.width, height: info.height };
}

async function renderCard(prompt: PromptPreview, deadline: AbortSignal): Promise<Buffer> {
  const [picture, logo, playfair, inter, interMedium] = await Promise.all([
    promptImage(prompt.imageUrl, deadline),
    asset("_assets/logo.png"),
    asset("_fonts/playfair-display-latin-500-normal.woff"),
    asset("_fonts/inter-latin-400-normal.woff"),
    asset("_fonts/inter-latin-500-normal.woff"),
  ]);

  const card = el(
    "div",
    {
      width: WIDTH,
      height: HEIGHT,
      alignItems: "center",
      fontFamily: "Inter",
      color: COLORS.foreground,
      backgroundColor: COLORS.background,
      backgroundImage: "radial-gradient(circle at 85% 10%, rgba(212,175,112,0.20), rgba(13,15,18,0) 55%)",
    },
    el(
      "div",
      { width: IMAGE_MAX_WIDTH, height: IMAGE_MAX_HEIGHT, marginLeft: MARGIN, marginRight: GAP, flexShrink: 0, alignItems: "center", justifyContent: "center" },
      img(picture.src, picture.width, picture.height, { borderRadius: 24 })
    ),
    el(
      "div",
      { width: TEXT_WIDTH, height: IMAGE_MAX_HEIGHT - 16, flexDirection: "column", justifyContent: "space-between" },
      el(
        "div",
        { flexDirection: "column", width: TEXT_WIDTH, gap: 22 },
        el(
          "div",
          {
            display: "block",
            fontFamily: "Playfair Display",
            fontWeight: 500,
            fontSize: titleSize(prompt.title),
            lineHeight: 1.15,
            width: TEXT_WIDTH,
            lineClamp: 4,
            overflow: "hidden",
          },
          prompt.title
        ),
        el(
          "div",
          { alignItems: "center", gap: 12, fontSize: 30, color: COLORS.muted },
          el("div", { display: "block", maxWidth: TEXT_WIDTH - 44, lineClamp: 1, overflow: "hidden" }, `by ${prompt.creatorName}`),
          prompt.verified ? img(VERIFIED_TICK, 28, 28) : null
        ),
        el(
          "div",
          {
            alignSelf: "flex-start",
            maxWidth: TEXT_WIDTH,
            marginTop: 6,
            padding: "12px 26px",
            borderRadius: 999,
            fontSize: 26,
            fontWeight: 500,
            color: COLORS.onGold,
            backgroundColor: COLORS.gold,
          },
          prompt.tool
        )
      ),
      el(
        "div",
        { width: TEXT_WIDTH, alignItems: "center", justifyContent: "space-between" },
        el(
          "div",
          { alignItems: "center", gap: 14 },
          img(`data:image/png;base64,${logo.toString("base64")}`, LOGO_WIDTH, 44),
          el("div", { fontFamily: "Playfair Display", fontSize: 34 }, "PARO")
        ),
        el("div", { fontSize: 24, color: COLORS.muted }, "parostudios.in")
      )
    )
  );

  const svg = await satori(card as never, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: "Playfair Display", data: playfair, weight: 500, style: "normal" },
      { name: "Inter", data: inter, weight: 400, style: "normal" },
      { name: "Inter", data: interMedium, weight: 500, style: "normal" },
    ],
    // Past the deadline these give up, and the card renders without those characters.
    loadAdditionalAsset: (languageCode, segment) => loadAdditionalAsset(languageCode, segment, deadline),
  });

  // WhatsApp can skip large images, so a compressed JPEG rather than a PNG.
  return sharp(Buffer.from(svg)).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
}

export async function GET(request: Request): Promise<Response> {
  // The generic card, briefly cached, for anything that can't have its own.
  const fallback = () =>
    new Response(null, { status: 302, headers: { Location: GENERIC_IMAGE, "Cache-Control": "public, max-age=300, s-maxage=300" } });

  const id = new URL(request.url).pathname.split("/").pop();
  const env = supabaseEnv(process.env);
  if (!env || !isUuid(id)) return fallback();

  const deadline = AbortSignal.timeout(NETWORK_BUDGET_MS);

  try {
    const prompt = await fetchPromptPreview(env, id, AbortSignal.any([deadline, AbortSignal.timeout(3000)]));
    if (!prompt || !isOwnImage(env, prompt.imageUrl)) return fallback();

    const card = await renderCard(prompt, deadline);
    return new Response(new Uint8Array(card), { headers: { "Content-Type": "image/jpeg", "Cache-Control": CACHE } });
  } catch (error) {
    console.error("Could not build preview card:", error);
    return fallback();
  }
}

// Some apps send a HEAD first to check an image before downloading it.
export const HEAD = GET;
