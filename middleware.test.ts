import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import middleware from "./middleware";

const ID = "3ebe292d-8eaf-4293-95fc-a807f79f6b0b";
const BOT = "WhatsApp/2.23.20.0 A";
const BROWSER = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";

const row = {
  id: ID,
  title: "Stitched",
  image_url: "https://x.supabase.co/storage/v1/object/public/prompt-images/u/a.jpg",
  ai_tool: "NANO BANANA (Gemini)",
  tags: ["photoshoot"],
  creator: { username: "parostudio", full_name: "Paro", verified: true },
};

const visit = (path: string, userAgent: string) =>
  middleware(new Request(`https://www.parostudios.in${path}`, { headers: { "user-agent": userAgent } }));

// next() from @vercel/functions marks "carry on to the app" with this header.
const carriedOn = (response: Response) => response.headers.get("x-middleware-next") === "1";

describe("link preview middleware", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("leaves real visitors alone without touching the database", async () => {
    expect(carriedOn(await visit(`/prompt/${ID}`, BROWSER))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers a bot with that prompt's tags, and never asks for the prompt text", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([row])));

    const response = await visit(`/prompt/${ID}`, BOT);
    const html = await response.text();

    expect(carriedOn(response)).toBe(false);
    expect(html).toContain('content="Stitched by Paro"');
    expect(html).toContain(`/api/og/prompt/${ID}`);
    expect(String(fetchMock.mock.calls[0][0])).not.toMatch(/[,=]prompt[,&]/);
  });

  it("answers a bot on a profile link", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ id: ID, username: "softaspause", full_name: "Aashu", bio: "Hi" }]))
    );

    expect(await (await visit(`/profile/${ID}`, BOT)).text()).toContain("Aashu (@softaspause) on Paro");
  });

  it("does not query for a malformed id", async () => {
    expect(carriedOn(await visit("/prompt/not-a-uuid", BOT))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a deleted prompt", () => Promise.resolve(new Response("[]"))],
    ["a database error", () => Promise.resolve(new Response("{}", { status: 500 }))],
    ["a timeout or network failure", () => Promise.reject(new Error("aborted"))],
  ])("falls back to the normal app on %s", async (_name, result) => {
    fetchMock.mockImplementation(result);

    expect(carriedOn(await visit(`/prompt/${ID}`, BOT))).toBe(true);
  });

  it("falls back when Supabase isn't configured", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");

    expect(carriedOn(await visit(`/prompt/${ID}`, BOT))).toBe(true);
  });
});
