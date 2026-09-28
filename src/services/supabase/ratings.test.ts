import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPromptRating, getPromptRatings, getUserPromptRating, ratePrompt } from "./ratings";
import { supabase } from "./client";

vi.mock("./client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe("ratings service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getPromptRating", () => {
    it("reads rating_average and rating_count directly from prompts table", async () => {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: { rating_average: 4.5, rating_count: 10 },
        error: null,
      });
      const eq = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const result = await getPromptRating("p-1");

      expect(supabase.from).toHaveBeenCalledWith("prompts");
      expect(select).toHaveBeenCalledWith("rating_average, rating_count");
      expect(eq).toHaveBeenCalledWith("id", "p-1");
      expect(result).toEqual({ average: 4.5, count: 10 });
    });

    it("returns null average and 0 count if prompt not found or empty id", async () => {
      const emptyResult = await getPromptRating("");
      expect(emptyResult).toEqual({ average: null, count: 0 });

      const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } });
      const eq = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const result = await getPromptRating("missing");
      expect(result).toEqual({ average: null, count: 0 });
    });
  });

  describe("getPromptRatings", () => {
    it("returns empty map when passed empty array", async () => {
      const result = await getPromptRatings([]);
      expect(result.size).toBe(0);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("queries prompts table in bulk for rating aggregates", async () => {
      const promptRows = [
        { id: "p1", rating_average: 4.8, rating_count: 15 },
        { id: "p2", rating_average: null, rating_count: 0 },
      ];
      const inMock = vi.fn().mockResolvedValue({ data: promptRows, error: null });
      const select = vi.fn().mockReturnValue({ in: inMock });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const result = await getPromptRatings(["p1", "p2"]);

      expect(supabase.from).toHaveBeenCalledWith("prompts");
      expect(select).toHaveBeenCalledWith("id, rating_average, rating_count");
      expect(inMock).toHaveBeenCalledWith("id", ["p1", "p2"]);
      expect(result.get("p1")).toEqual({ average: 4.8, count: 15 });
      expect(result.get("p2")).toEqual({ average: null, count: 0 });
    });
  });

  describe("getUserPromptRating", () => {
    it("fetches user's individual rating from prompt_ratings table", async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: { rating: 5 }, error: null });
      const eq2 = vi.fn().mockReturnValue({ maybeSingle });
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
      const select = vi.fn().mockReturnValue({ eq: eq1 });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const rating = await getUserPromptRating("u1", "p1");

      expect(supabase.from).toHaveBeenCalledWith("prompt_ratings");
      expect(eq1).toHaveBeenCalledWith("user_id", "u1");
      expect(eq2).toHaveBeenCalledWith("prompt_id", "p1");
      expect(rating).toBe(5);
    });
  });

  describe("ratePrompt", () => {
    it("upserts user rating and returns updated prompt rating", async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      const maybeSingle = vi.fn().mockResolvedValue({
        data: { rating_average: 5.0, rating_count: 1 },
        error: null,
      });
      const eq = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ eq });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === "prompt_ratings") {
          return { upsert: upsertMock } as never;
        }
        if (table === "prompts") {
          return { select } as never;
        }
        return {} as never;
      });

      const { ratingInfo, error } = await ratePrompt("u1", "p1", 5);

      expect(error).toBeNull();
      expect(upsertMock).toHaveBeenCalledWith(
        { user_id: "u1", prompt_id: "p1", rating: 5 },
        { onConflict: "user_id,prompt_id" }
      );
      expect(upsertMock.mock.calls[0][0]).not.toHaveProperty("updated_at");
      expect(ratingInfo).toEqual({ average: 5.0, count: 1 });
    });

    it("clamps out-of-range ratings to 1..5", async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      const maybeSingle = vi.fn().mockResolvedValue({
        data: { rating_average: 5.0, rating_count: 1 },
        error: null,
      });
      const eq = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ eq });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === "prompt_ratings") {
          return { upsert: upsertMock } as never;
        }
        if (table === "prompts") {
          return { select } as never;
        }
        return {} as never;
      });

      await ratePrompt("user-1", "prompt-2", 10);
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({ rating: 5 }),
        expect.anything()
      );
    });
  });
});
