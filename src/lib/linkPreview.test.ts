import { describe, expect, it } from "vitest";
import { escapeHtml, isOwnImage, isPreviewBot, isUuid, previewHtml, profileTags, promptTags, toolLabel } from "./linkPreview";

const prompt = {
  id: "3ebe292d-8eaf-4293-95fc-a807f79f6b0b",
  title: "Stitched",
  imageUrl: "https://x.supabase.co/storage/v1/object/public/prompt-images/u/a.jpg",
  tool: "Nano Banana",
  tags: ["photoshoot", "fantasy", "cinematic", "design"],
  creatorName: "Paro",
  verified: true,
};

describe("isPreviewBot", () => {
  it.each([
    "WhatsApp/2.23.20.0 A",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Twitterbot/1.0",
    "LinkedInBot/1.0 (compatible; Mozilla/5.0)",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "TelegramBot (like TwitterBot)",
    "Slackbot-LinkExpanding 1.0",
  ])("recognises %s", (userAgent) => {
    expect(isPreviewBot(userAgent)).toBe(true);
  });

  it.each([
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "",
    null,
  ])("leaves %s to the normal app", (userAgent) => {
    expect(isPreviewBot(userAgent)).toBe(false);
  });
});

describe("isUuid", () => {
  it("accepts only real ids", () => {
    expect(isUuid(prompt.id)).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(`${prompt.id}&select=prompt`)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe("toolLabel", () => {
  it("shortens known tools and keeps custom ones as typed", () => {
    expect(toolLabel("NANO BANANA (Gemini)")).toBe("Nano Banana");
    expect(toolLabel("My own tool")).toBe("My own tool");
  });
});

describe("isOwnImage", () => {
  const env = { url: "https://x.supabase.co", anonKey: "k" };

  it("only trusts our prompt image bucket", () => {
    expect(isOwnImage(env, prompt.imageUrl)).toBe(true);
    expect(isOwnImage(env, "https://evil.example/a.jpg")).toBe(false);
    expect(isOwnImage(env, "https://x.supabase.co/storage/v1/object/public/avatars/a.jpg")).toBe(false);
  });
});

describe("preview tags", () => {
  it("names the prompt, its creator and tool, and points at its card", () => {
    expect(promptTags(prompt)).toMatchObject({
      title: "Stitched by Paro",
      description: "Nano Banana prompt · photoshoot, fantasy, cinematic · on Paro",
      url: `https://www.parostudios.in/prompt/${prompt.id}`,
      image: `https://www.parostudios.in/api/og/prompt/${prompt.id}`,
    });
  });

  it("describes a profile, with a fallback for an empty bio", () => {
    const profile = { id: "p", name: "Aashu", username: "softaspause", bio: "" };

    expect(profileTags(profile).title).toBe("Aashu (@softaspause) on Paro");
    expect(profileTags(profile).description).toBe("See the AI prompts Aashu shares on Paro.");
    expect(profileTags({ ...profile, bio: "I make things" }).description).toBe("I make things");
  });

  it("escapes anything a user wrote, so a title can't inject HTML", () => {
    const html = previewHtml(promptTags({ ...prompt, title: `"><script>alert(1)</script>` }));

    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
    expect(escapeHtml(`a&b'c`)).toBe("a&amp;b&#39;c");
  });
});
