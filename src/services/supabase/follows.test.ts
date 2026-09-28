import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getFollowerCount, getFollowerCounts, getFollowingCount, isFollowing, setFollow } from "./follows";
import { supabase } from "./client";

vi.mock("./client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe("follows service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getFollowerCount", () => {
    it("queries profiles table for follower_count column", async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: { follower_count: 120 }, error: null });
      const eq = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const count = await getFollowerCount("user-1");

      expect(supabase.from).toHaveBeenCalledWith("profiles");
      expect(select).toHaveBeenCalledWith("follower_count");
      expect(eq).toHaveBeenCalledWith("id", "user-1");
      expect(count).toBe(120);
    });

    it("returns 0 on error or missing profile", async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } });
      const eq = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const count = await getFollowerCount("user-missing");
      expect(count).toBe(0);
    });
  });

  describe("getFollowerCounts", () => {
    it("returns empty map immediately when passed empty array", async () => {
      const counts = await getFollowerCounts([]);
      expect(counts.size).toBe(0);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("queries profiles table for id and follower_count in bulk", async () => {
      const profileData = [
        { id: "u1", follower_count: 50 },
        { id: "u2", follower_count: 88 },
      ];
      const inMock = vi.fn().mockResolvedValue({ data: profileData, error: null });
      const select = vi.fn().mockReturnValue({ in: inMock });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const counts = await getFollowerCounts(["u1", "u2", "u1"]);

      expect(supabase.from).toHaveBeenCalledWith("profiles");
      expect(select).toHaveBeenCalledWith("id, follower_count");
      expect(inMock).toHaveBeenCalledWith("id", ["u1", "u2"]);
      expect(counts.get("u1")).toBe(50);
      expect(counts.get("u2")).toBe(88);
    });

    it("handles errors gracefully by returning an empty map", async () => {
      const inMock = vi.fn().mockResolvedValue({ data: null, error: { message: "db error" } });
      const select = vi.fn().mockReturnValue({ in: inMock });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const counts = await getFollowerCounts(["u1"]);
      expect(counts.size).toBe(0);
    });
  });

  describe("getFollowingCount", () => {
    it("queries profiles table for following_count column", async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: { following_count: 15 }, error: null });
      const eq = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const count = await getFollowingCount("user-1");

      expect(supabase.from).toHaveBeenCalledWith("profiles");
      expect(select).toHaveBeenCalledWith("following_count");
      expect(eq).toHaveBeenCalledWith("id", "user-1");
      expect(count).toBe(15);
    });

    it("returns 0 on error or missing profile", async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "error" } });
      const eq = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const count = await getFollowingCount("user-missing");
      expect(count).toBe(0);
    });
  });

  describe("isFollowing", () => {
    it("checks if follower is following following_id", async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "f-1" }, error: null });
      const match = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ match });
      vi.mocked(supabase.from).mockReturnValue({ select } as never);

      const result = await isFollowing("u1", "u2");
      expect(supabase.from).toHaveBeenCalledWith("follows");
      expect(match).toHaveBeenCalledWith({ follower_id: "u1", following_id: "u2" });
      expect(result).toBe(true);
    });
  });

  describe("setFollow", () => {
    it("deletes follow row when active is false", async () => {
      const matchDelete = vi.fn().mockResolvedValue({ error: null });
      const deleteFn = vi.fn().mockReturnValue({ match: matchDelete });
      vi.mocked(supabase.from).mockReturnValue({ delete: deleteFn } as never);

      const { error } = await setFollow("u1", "u2", false);
      expect(error).toBeNull();
      expect(supabase.from).toHaveBeenCalledWith("follows");
      expect(deleteFn).toHaveBeenCalled();
      expect(matchDelete).toHaveBeenCalledWith({ follower_id: "u1", following_id: "u2" });
    });

    it("upserts follow row when active is true", async () => {
      const upsertFn = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockReturnValue({ upsert: upsertFn } as never);

      const { error } = await setFollow("u1", "u2", true);
      expect(error).toBeNull();
      expect(supabase.from).toHaveBeenCalledWith("follows");
      expect(upsertFn).toHaveBeenCalledWith(
        { follower_id: "u1", following_id: "u2" },
        { onConflict: "follower_id,following_id", ignoreDuplicates: true }
      );
    });
  });
});
