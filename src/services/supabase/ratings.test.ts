import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getPromptRating,
  getPromptRatings,
  getUserPromptRating,
  ratePrompt,
} from "./ratings";
import { supabase } from "./client";

vi.mock("./client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe("ratings service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPromptRating", () => {
    it("computes average and count from database records", async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [{ rating: 5 }, { rating: 4 }, { rating: 5 }],
          error: null,
        }),
      } as never);

      const result = await getPromptRating("prompt-1");
      expect(result.average).toBe(4.7);
      expect(result.count).toBe(3);
    });

    it("returns null average and count 0 when database returns empty records", async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      } as never);

      const result = await getPromptRating("prompt-test-id");
      expect(result.average).toBeNull();
      expect(result.count).toBe(0);
    });

    it("returns null average and count 0 for empty promptId", async () => {
      const result = await getPromptRating("");
      expect(result.average).toBeNull();
      expect(result.count).toBe(0);
    });
  });

  describe("getPromptRatings (bulk)", () => {
    it("returns a map with ratings for all requested prompt IDs", async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [
            { prompt_id: "p1", rating: 5 },
            { prompt_id: "p1", rating: 5 },
            { prompt_id: "p2", rating: 4 },
          ],
          error: null,
        }),
      } as never);

      const ratingsMap = await getPromptRatings(["p1", "p2", "p3"]);
      expect(ratingsMap.size).toBe(3);
      expect(ratingsMap.get("p1")?.average).toBe(5.0);
      expect(ratingsMap.get("p1")?.count).toBe(2);
      expect(ratingsMap.get("p2")?.average).toBe(4.0);
      expect(ratingsMap.get("p2")?.count).toBe(1);
      expect(ratingsMap.get("p3")?.average).toBeNull();
      expect(ratingsMap.get("p3")?.count).toBe(0);
    });

    it("handles empty prompt list", async () => {
      const result = await getPromptRatings([]);
      expect(result.size).toBe(0);
    });
  });

  describe("ratePrompt & getUserPromptRating", () => {
    it("clamps rating between 1 and 5 and saves to supabase", async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      const eqMock = vi.fn().mockResolvedValue({ data: [{ rating: 5 }], error: null });
      const maybeSingleMock = vi.fn().mockResolvedValue({ data: { rating: 5 }, error: null });

      vi.mocked(supabase.from).mockImplementation(() => {
        return {
          upsert: upsertMock,
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string) => {
              if (col === "user_id") {
                return {
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: maybeSingleMock,
                  }),
                };
              }
              return eqMock();
            }),
          }),
        } as never;
      });

      const { ratingInfo, error } = await ratePrompt("user-1", "prompt-1", 5);
      expect(error).toBeNull();
      expect(ratingInfo.average).toBe(5.0);
      expect(ratingInfo.count).toBe(1);
      expect(upsertMock).toHaveBeenCalledWith(
        {
          user_id: "user-1",
          prompt_id: "prompt-1",
          rating: 5,
        },
        { onConflict: "user_id,prompt_id" }
      );
      expect(upsertMock.mock.calls[0][0]).not.toHaveProperty("updated_at");

      const userRating = await getUserPromptRating("user-1", "prompt-1");
      expect(userRating).toBe(5);
    });

    it("clamps out-of-range ratings to 1..5", async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockReturnValue({
        upsert: upsertMock,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as never);

      await ratePrompt("user-1", "prompt-2", 10);
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({ rating: 5 }),
        expect.anything()
      );
    });
  });
});
