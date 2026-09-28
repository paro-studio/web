import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getLikeCount, getLikeCounts, isLiked, getLikedPromptIds, setLike } from "./likes";
import { supabase } from "./client";

vi.mock("./client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe("likes service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getLikeCount", () => {
    it("queries prompts table for like_count column", async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: { like_count: 42 }, error: null });
      const eq = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const count = await getLikeCount("prompt-1");

      expect(supabase.from).toHaveBeenCalledWith("prompts");
      expect(select).toHaveBeenCalledWith("like_count");
      expect(eq).toHaveBeenCalledWith("id", "prompt-1");
      expect(count).toBe(42);
    });

    it("returns 0 if error or row not found", async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "error" } });
      const eq = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const count = await getLikeCount("prompt-missing");
      expect(count).toBe(0);
    });
  });

  describe("getLikeCounts", () => {
    it("returns empty map immediately when passed empty array", async () => {
      const counts = await getLikeCounts([]);
      expect(counts.size).toBe(0);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("queries prompts table for id and like_count in bulk", async () => {
      const promptData = [
        { id: "p1", like_count: 10 },
        { id: "p2", like_count: 5 },
      ];
      const inMock = vi.fn().mockResolvedValue({ data: promptData, error: null });
      const select = vi.fn().mockReturnValue({ in: inMock });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const counts = await getLikeCounts(["p1", "p2", "p1"]);

      expect(supabase.from).toHaveBeenCalledWith("prompts");
      expect(select).toHaveBeenCalledWith("id, like_count");
      expect(inMock).toHaveBeenCalledWith("id", ["p1", "p2"]);
      expect(counts.get("p1")).toBe(10);
      expect(counts.get("p2")).toBe(5);
    });

    it("handles errors gracefully by returning an empty map", async () => {
      const inMock = vi.fn().mockResolvedValue({ data: null, error: { message: "db error" } });
      const select = vi.fn().mockReturnValue({ in: inMock });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const counts = await getLikeCounts(["p1"]);
      expect(counts.size).toBe(0);
    });
  });

  describe("isLiked", () => {
    it("checks if user liked a prompt", async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "like-1" }, error: null });
      const match = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ match });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const result = await isLiked("u1", "p1");
      expect(supabase.from).toHaveBeenCalledWith("likes");
      expect(match).toHaveBeenCalledWith({ user_id: "u1", prompt_id: "p1" });
      expect(result).toBe(true);
    });
  });

  describe("getLikedPromptIds", () => {
    it("returns set of prompt ids liked by user", async () => {
      const inMock = vi.fn().mockResolvedValue({
        data: [{ prompt_id: "p1" }, { prompt_id: "p3" }],
        error: null,
      });
      const eq = vi.fn().mockReturnValue({ in: inMock });
      const select = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const likedSet = await getLikedPromptIds("u1", ["p1", "p2", "p3"]);
      expect(supabase.from).toHaveBeenCalledWith("likes");
      expect(likedSet.has("p1")).toBe(true);
      expect(likedSet.has("p2")).toBe(false);
      expect(likedSet.has("p3")).toBe(true);
    });
  });

  describe("setLike", () => {
    it("deletes like when active is false", async () => {
      const matchDelete = vi.fn().mockResolvedValue({ error: null });
      const deleteFn = vi.fn().mockReturnValue({ match: matchDelete });
      vi.mocked(supabase.from).mockReturnValue({ delete: deleteFn } as never);

      const { error } = await setLike("u1", "p1", false);
      expect(error).toBeNull();
      expect(supabase.from).toHaveBeenCalledWith("likes");
      expect(deleteFn).toHaveBeenCalled();
      expect(matchDelete).toHaveBeenCalledWith({ user_id: "u1", prompt_id: "p1" });
    });

    it("upserts like when active is true", async () => {
      const upsertFn = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockReturnValue({ upsert: upsertFn } as never);

      const { error } = await setLike("u1", "p1", true);
      expect(error).toBeNull();
      expect(supabase.from).toHaveBeenCalledWith("likes");
      expect(upsertFn).toHaveBeenCalledWith(
        { user_id: "u1", prompt_id: "p1" },
        { onConflict: "user_id,prompt_id", ignoreDuplicates: true }
      );
    });
  });
});
