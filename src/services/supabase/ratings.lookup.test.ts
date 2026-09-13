import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserPromptRating } from "./ratings";
const lookup = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: lookup }) }) }) }) } }));

describe("rating lookup error contract", () => {
  beforeEach(() => { lookup.mockReset(); });
  it("distinguishes an absent rating from a failed lookup in strict mode", async () => {
    lookup.mockResolvedValueOnce({ data: null, error: null });
    expect(await getUserPromptRating("viewer", "prompt", { throwOnError: true })).toBeNull();
    const error = { code: "503", message: "Unavailable" };
    lookup.mockResolvedValueOnce({ data: null, error });
    await expect(getUserPromptRating("viewer", "prompt", { throwOnError: true })).rejects.toEqual(error);
  });
  it("propagates network rejection only when requested", async () => {
    lookup.mockRejectedValue(new Error("offline"));
    await expect(getUserPromptRating("viewer", "prompt", { throwOnError: true })).rejects.toThrow("offline");
    expect(await getUserPromptRating("viewer", "prompt")).toBeNull();
  });
  it("returns the existing rating", async () => {
    lookup.mockResolvedValue({ data: { rating: 4 }, error: null });
    expect(await getUserPromptRating("viewer", "prompt", { throwOnError: true })).toBe(4);
  });
});
