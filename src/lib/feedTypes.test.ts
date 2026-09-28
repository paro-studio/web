import { describe, it, expect } from "vitest";
import {
  toImageFeedItem,
  injectAdvertisements,
  type ImageFeedItem,
  type AdvertisementFeedItem,
} from "./feedTypes";

/** A fully-populated camelCase prompt, as usePrompts hands it over. */
function makePrompt(overrides: Partial<Parameters<typeof toImageFeedItem>[0]> = {}) {
  return {
    id: "prompt-1",
    title: "A cat in a spacesuit",
    imageUrl: "https://example.test/cat.png",
    toolUsed: "NANO BANANA (Gemini)",
    viewCount: 12,
    copyCount: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    tags: ["animals", "scifi"],
    creator: {
      id: "user-1",
      username: "astro",
      displayName: "Astro Cat",
      avatarUrl: "https://example.test/avatar.png",
      verified: true,
    },
    likeCount: 7,
    isLiked: true,
    isSaved: false,
    accuracyRating: 4.8,
    ratingCount: 15,
    ...overrides,
  };
}

describe("toImageFeedItem", () => {
  it("maps every camelCase field onto its snake_case counterpart", () => {
    // This is the boundary the README calls the most bug-prone part of the
    // codebase. Assert the whole object — a partial assertion would let a
    // silently-dropped field through.
    expect(toImageFeedItem(makePrompt())).toEqual({
      type: "image",
      data: {
        id: "prompt-1",
        title: "A cat in a spacesuit",
        image_url: "https://example.test/cat.png",
        tool_used: "NANO BANANA (Gemini)",
        view_count: 12,
        copy_count: 3,
        like_count: 7,
        created_at: "2026-01-01T00:00:00.000Z",
        creator: {
          id: "user-1",
          username: "astro",
          display_name: "Astro Cat",
          avatar_url: "https://example.test/avatar.png",
          verified: true,
        },
        tags: ["animals", "scifi"],
        is_liked: true,
        is_saved: false,
        accuracy_rating: 4.8,
        rating_count: 15,
      },
    });
  });

  it("never leaks a camelCase key into the output", () => {
    // Catches the specific failure of adding a field to the interface and
    // forgetting to rename it on the way through.
    const { data } = toImageFeedItem(makePrompt());
    const keys = [...Object.keys(data), ...Object.keys(data.creator)];
    expect(keys.filter((k) => /[A-Z]/.test(k))).toEqual([]);
  });

  it("preserves falsy values rather than dropping them", () => {
    // 0 and false are meaningful here; a `||` fallback anywhere in the mapping
    // would quietly turn a zero view count into something else.
    const { data } = toImageFeedItem(
      makePrompt({
        viewCount: 0,
        copyCount: 0,
        likeCount: 0,
        isLiked: false,
        isSaved: false,
        accuracyRating: 0,
        ratingCount: 0,
      }),
    );
    expect(data.view_count).toBe(0);
    expect(data.copy_count).toBe(0);
    expect(data.like_count).toBe(0);
    expect(data.is_liked).toBe(false);
    expect(data.is_saved).toBe(false);
    expect(data.accuracy_rating).toBe(0);
    expect(data.rating_count).toBe(0);
  });

  it("carries a null avatar through untouched", () => {
    const { data } = toImageFeedItem(
      makePrompt({
        creator: { ...makePrompt().creator, avatarUrl: null },
      }),
    );
    expect(data.creator.avatar_url).toBeNull();
  });

  it("keeps an empty tag list as an array", () => {
    expect(toImageFeedItem(makePrompt({ tags: [] })).data.tags).toEqual([]);
  });
});

describe("injectAdvertisements", () => {
  const items = (n: number): ImageFeedItem[] =>
    Array.from({ length: n }, (_, i) =>
      toImageFeedItem(makePrompt({ id: `prompt-${i}` })),
    );

  const makeAd = (index: number): AdvertisementFeedItem => ({
    type: "advertisement",
    data: { id: `ad-${index}` },
  });

  it("returns items untouched when no ad provider is configured", () => {
    const input = items(20);
    expect(injectAdvertisements(input)).toBe(input);
  });

  it("inserts an ad after every interval", () => {
    const result = injectAdvertisements(items(9), 3, makeAd);
    // 9 items, ads after index 2 and 5 — but not after 8, which is last.
    expect(result.map((i) => i.type)).toEqual([
      "image", "image", "image", "advertisement",
      "image", "image", "image", "advertisement",
      "image", "image", "image",
    ]);
  });

  it("does not append a trailing ad", () => {
    // An ad as the final row looks broken. With exactly one full interval
    // there is nothing after it, so no ad should be added at all.
    const result = injectAdvertisements(items(8), 8, makeAd);
    expect(result).toHaveLength(8);
    expect(result.every((i) => i.type === "image")).toBe(true);
  });

  it("increments the ad index so each slot can differ", () => {
    const result = injectAdvertisements(items(10), 3, makeAd);
    const ads = result.filter(
      (i): i is AdvertisementFeedItem => i.type === "advertisement",
    );
    expect(ads.map((a) => a.data.id)).toEqual(["ad-0", "ad-1", "ad-2"]);
  });

  it("defaults to an interval of 8", () => {
    const result = injectAdvertisements(items(17), undefined, makeAd);
    expect(result.filter((i) => i.type === "advertisement")).toHaveLength(2);
  });

  it("handles an empty feed", () => {
    expect(injectAdvertisements([], 3, makeAd)).toEqual([]);
  });

  it("preserves the original order of items", () => {
    const result = injectAdvertisements(items(7), 3, makeAd);
    const ids = result
      .filter((i): i is ImageFeedItem => i.type === "image")
      .map((i) => i.data.id);
    expect(ids).toEqual([
      "prompt-0", "prompt-1", "prompt-2", "prompt-3",
      "prompt-4", "prompt-5", "prompt-6",
    ]);
  });
});
