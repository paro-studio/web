import { beforeEach, describe, expect, it } from "vitest";
import {
  clearViewTracking,
  DEFAULT_VIEW_DEDUPE_WINDOW_MS,
  recordViewIfEligible,
} from "./viewTracking";

describe("viewTracking", () => {
  beforeEach(() => {
    localStorage.clear();
    clearViewTracking();
  });

  it("returns true on initial view of a prompt", () => {
    const isFirstView = recordViewIfEligible("prompt-1");
    expect(isFirstView).toBe(true);
  });

  it("deduplicates subsequent views of the same prompt within the cooldown window", () => {
    const baseTime = 1000000;
    const firstView = recordViewIfEligible("prompt-1", DEFAULT_VIEW_DEDUPE_WINDOW_MS, baseTime);
    expect(firstView).toBe(true);

    // Navigating back and forth 5 minutes later
    const fiveMinutesLater = baseTime + 5 * 60 * 1000;
    const secondView = recordViewIfEligible("prompt-1", DEFAULT_VIEW_DEDUPE_WINDOW_MS, fiveMinutesLater);
    expect(secondView).toBe(false);

    // Navigating back and forth 29 minutes later
    const twentyNineMinutesLater = baseTime + 29 * 60 * 1000;
    const thirdView = recordViewIfEligible("prompt-1", DEFAULT_VIEW_DEDUPE_WINDOW_MS, twentyNineMinutesLater);
    expect(thirdView).toBe(false);
  });

  it("records views for distinct prompts independently", () => {
    const baseTime = 1000000;
    expect(recordViewIfEligible("prompt-1", DEFAULT_VIEW_DEDUPE_WINDOW_MS, baseTime)).toBe(true);
    expect(recordViewIfEligible("prompt-2", DEFAULT_VIEW_DEDUPE_WINDOW_MS, baseTime + 1000)).toBe(true);
    expect(recordViewIfEligible("prompt-3", DEFAULT_VIEW_DEDUPE_WINDOW_MS, baseTime + 2000)).toBe(true);

    // prompt-1 is still deduplicated
    expect(recordViewIfEligible("prompt-1", DEFAULT_VIEW_DEDUPE_WINDOW_MS, baseTime + 3000)).toBe(false);
  });

  it("allows counting another view after the cooldown window expires", () => {
    const baseTime = 1000000;
    const cooldown = 30 * 60 * 1000; // 30 min

    expect(recordViewIfEligible("prompt-1", cooldown, baseTime)).toBe(true);

    // 31 minutes later (cooldown elapsed)
    const afterCooldown = baseTime + cooldown + 1000;
    expect(recordViewIfEligible("prompt-1", cooldown, afterCooldown)).toBe(true);
  });

  it("returns false for empty or falsy prompt IDs", () => {
    expect(recordViewIfEligible("")).toBe(false);
  });

  it("falls back to memory if localStorage throws an error", () => {
    const baseTime = 1000000;
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error("QuotaExceeded / SecurityError");
    };

    try {
      expect(recordViewIfEligible("prompt-fallback", DEFAULT_VIEW_DEDUPE_WINDOW_MS, baseTime)).toBe(true);
      expect(recordViewIfEligible("prompt-fallback", DEFAULT_VIEW_DEDUPE_WINDOW_MS, baseTime + 1000)).toBe(false);
    } finally {
      localStorage.setItem = originalSetItem;
    }
  });

  it("preserves earlier views in memory when storage is unavailable across multiple prompts (A -> B -> A)", () => {
    const baseTime = 1000000;
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error("QuotaExceeded / SecurityError");
    };

    try {
      // View prompt A
      expect(recordViewIfEligible("prompt-A", DEFAULT_VIEW_DEDUPE_WINDOW_MS, baseTime)).toBe(true);
      // View prompt B
      expect(recordViewIfEligible("prompt-B", DEFAULT_VIEW_DEDUPE_WINDOW_MS, baseTime + 1000)).toBe(true);
      // Re-visit prompt A within window: should be deduplicated
      expect(recordViewIfEligible("prompt-A", DEFAULT_VIEW_DEDUPE_WINDOW_MS, baseTime + 2000)).toBe(false);
      // Re-visit prompt B within window: should be deduplicated
      expect(recordViewIfEligible("prompt-B", DEFAULT_VIEW_DEDUPE_WINDOW_MS, baseTime + 3000)).toBe(false);
    } finally {
      localStorage.setItem = originalSetItem;
    }
  });
});
