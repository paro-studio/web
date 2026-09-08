import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile, MOBILE_BREAKPOINT } from "./use-mobile";

describe("use-mobile", () => {
  it("exports MOBILE_BREAKPOINT as 768 to match Tailwind md breakpoint", () => {
    expect(MOBILE_BREAKPOINT).toBe(768);
  });

  it("returns true when innerWidth is under MOBILE_BREAKPOINT", () => {
    window.innerWidth = 500;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns false when innerWidth is greater than or equal to MOBILE_BREAKPOINT", () => {
    window.innerWidth = 768;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
