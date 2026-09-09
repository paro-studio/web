import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getProfile, updateProfile } from "./profiles";
import { supabase } from "./client";

vi.mock("./client", () => ({
  supabase: { from: vi.fn() },
}));

describe("profiles service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("updateProfile", () => {
    it("updates profile without sending updated_at", async () => {
      const mockProfile = {
        id: "user-1",
        username: "johndoe",
        full_name: "John Doe",
        avatar_url: "https://example.com/avatar.png",
        cover_url: null,
        bio: "Hello world",
        verified: false,
      };

      const singleMock = vi.fn().mockResolvedValue({
        data: mockProfile,
        error: null,
      });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const eqMock = vi.fn().mockReturnValue({ select: selectMock });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });

      vi.mocked(supabase.from).mockReturnValue({
        update: updateMock,
      } as never);

      const updates = {
        username: "johndoe",
        full_name: "John Doe",
        bio: "Hello world",
      };

      const { profile, error } = await updateProfile("user-1", updates);

      expect(supabase.from).toHaveBeenCalledWith("profiles");
      expect(updateMock).toHaveBeenCalledWith(updates);
      expect(updateMock.mock.calls[0][0]).not.toHaveProperty("updated_at");
      expect(eqMock).toHaveBeenCalledWith("id", "user-1");
      expect(error).toBeNull();
      expect(profile).toEqual(mockProfile);
    });

    it("handles unique constraint violation (username taken)", async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "23505",
          message: "duplicate key value violates unique constraint",
          details: "Key (username)=(johndoe) already exists.",
        },
      });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const eqMock = vi.fn().mockReturnValue({ select: selectMock });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });

      vi.mocked(supabase.from).mockReturnValue({
        update: updateMock,
      } as never);

      const { profile, error } = await updateProfile("user-1", { username: "johndoe" });

      expect(profile).toBeNull();
      expect(error?.message).toBe("Username already taken");
    });
  });

  describe("getProfile", () => {
    it("fetches profile by id", async () => {
      const mockProfile = {
        id: "user-1",
        username: "johndoe",
        full_name: "John Doe",
      };

      const singleMock = vi.fn().mockResolvedValue({
        data: mockProfile,
        error: null,
      });
      const eqMock = vi.fn().mockReturnValue({ single: singleMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

      vi.mocked(supabase.from).mockReturnValue({
        select: selectMock,
      } as never);

      const profile = await getProfile("user-1");

      expect(supabase.from).toHaveBeenCalledWith("profiles");
      expect(selectMock).toHaveBeenCalledWith("*");
      expect(eqMock).toHaveBeenCalledWith("id", "user-1");
      expect(profile).toEqual(mockProfile);
    });

    it("returns null when profile does not exist (PGRST116)", async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116" },
      });
      const eqMock = vi.fn().mockReturnValue({ single: singleMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

      vi.mocked(supabase.from).mockReturnValue({
        select: selectMock,
      } as never);

      const profile = await getProfile("non-existent");
      expect(profile).toBeNull();
    });
  });
});
