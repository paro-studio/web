import { describe, it, expect } from "vitest";
import { canPost, CREATOR_FORM_URL } from "./creators";

describe("canPost", () => {
  it("lets creators and verified accounts post, and nobody else", () => {
    expect(canPost({ verified: false, is_creator: true })).toBe(true);
    expect(canPost({ verified: true, is_creator: false })).toBe(true);
    expect(canPost({ verified: false, is_creator: false })).toBe(false);
    expect(canPost({})).toBe(false);
  });

  it("says no while signed out or still loading", () => {
    expect(canPost(null)).toBe(false);
    expect(canPost(undefined)).toBe(false);
  });

  it("links to a Google Form over https", () => {
    expect(CREATOR_FORM_URL).toMatch(/^https:\/\/docs\.google\.com\/forms\//);
  });
});
