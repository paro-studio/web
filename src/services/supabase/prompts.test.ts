import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DAILY_UPLOAD_LIMIT_UNVERIFIED,
  getUtcMidnightIso,
  getDailyUploadCount,
  checkDailyUploadLimit,
  deletePrompt,
  getAllPrompts,
  getUserPrompts,
  updatePrompt,
} from "./prompts";
import { supabase } from "./client";

vi.mock("./client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock("./storage", () => ({
  deletePromptImage: vi.fn().mockResolvedValue({ error: null }),
}));

const mockDbPrompts = [
  {
    id: "prompt-1",
    user_id: "user-1",
    title: "Cyberpunk City",
    prompt: "A neon city in 2077",
    image_url: "https://example.com/cyberpunk.png",
    ai_tool: "Midjourney",
    tags: ["cyberpunk", "city"],
    created_at: "2026-01-01T00:00:00.000Z",
    view_count: 10,
    copy_count: 5,
  },
  {
    id: "prompt-2",
    user_id: "user-2",
    title: "Watercolor Landscape",
    prompt: "Serene mountain lake",
    image_url: "https://example.com/landscape.png",
    ai_tool: "DALL-E",
    tags: ["art", "nature"],
    created_at: "2026-01-02T00:00:00.000Z",
    view_count: 0,
    copy_count: 0,
  },
];

describe("prompts service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAllPrompts", () => {
    it("returns normalized prompts with camelCase properties", async () => {
      const limitMock = vi.fn().mockResolvedValue({
        data: mockDbPrompts,
        error: null,
      });
      const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
      const selectMock = vi.fn().mockReturnValue({ order: orderMock });

      vi.mocked(supabase.from).mockReturnValue({
        select: selectMock,
      } as never);

      const { prompts, error } = await getAllPrompts(25);

      expect(supabase.from).toHaveBeenCalledWith("prompts");
      expect(selectMock).toHaveBeenCalledWith("*");
      expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: false });
      expect(limitMock).toHaveBeenCalledWith(25);
      expect(error).toBeNull();
      expect(prompts).toEqual([
        {
          id: "prompt-1",
          userId: "user-1",
          title: "Cyberpunk City",
          promptText: "A neon city in 2077",
          imageUrl: "https://example.com/cyberpunk.png",
          toolUsed: "Midjourney",
          tags: ["cyberpunk", "city"],
          createdAt: "2026-01-01T00:00:00.000Z",
          viewCount: 10,
          copyCount: 5,
        },
        {
          id: "prompt-2",
          userId: "user-2",
          title: "Watercolor Landscape",
          promptText: "Serene mountain lake",
          imageUrl: "https://example.com/landscape.png",
          toolUsed: "DALL-E",
          tags: ["art", "nature"],
          createdAt: "2026-01-02T00:00:00.000Z",
          viewCount: 0,
          copyCount: 0,
        },
      ]);
    });

    it("returns empty array and error on database error", async () => {
      const mockError = {
        code: "PGRST500",
        message: "Database error",
        details: "Internal server error",
        hint: "",
      };

      const limitMock = vi.fn().mockResolvedValue({
        data: null,
        error: mockError,
      });
      const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
      const selectMock = vi.fn().mockReturnValue({ order: orderMock });

      vi.mocked(supabase.from).mockReturnValue({
        select: selectMock,
      } as never);

      const { prompts, error } = await getAllPrompts();

      expect(prompts).toEqual([]);
      expect(error).toBe(mockError);
    });

    it("handles null data gracefully without error", async () => {
      const limitMock = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });
      const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
      const selectMock = vi.fn().mockReturnValue({ order: orderMock });

      vi.mocked(supabase.from).mockReturnValue({
        select: selectMock,
      } as never);

      const { prompts, error } = await getAllPrompts();

      expect(prompts).toEqual([]);
      expect(error).toBeNull();
    });
  });

  describe("getUserPrompts", () => {
    it("returns normalized prompts for given userId", async () => {
      const orderMock = vi.fn().mockResolvedValue({
        data: [mockDbPrompts[0]],
        error: null,
      });
      const eqMock = vi.fn().mockReturnValue({ order: orderMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

      vi.mocked(supabase.from).mockReturnValue({
        select: selectMock,
      } as never);

      const { prompts, error } = await getUserPrompts("user-1");

      expect(supabase.from).toHaveBeenCalledWith("prompts");
      expect(selectMock).toHaveBeenCalledWith("*");
      expect(eqMock).toHaveBeenCalledWith("user_id", "user-1");
      expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: false });
      expect(error).toBeNull();
      expect(prompts).toEqual([
        {
          id: "prompt-1",
          userId: "user-1",
          title: "Cyberpunk City",
          promptText: "A neon city in 2077",
          imageUrl: "https://example.com/cyberpunk.png",
          toolUsed: "Midjourney",
          tags: ["cyberpunk", "city"],
          createdAt: "2026-01-01T00:00:00.000Z",
          viewCount: 10,
          copyCount: 5,
        },
      ]);
    });
  });

  describe("updatePrompt", () => {
    it("updates prompt without sending updated_at", async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: { id: "prompt-1", title: "Updated Title" },
        error: null,
      });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const eqUserMock = vi.fn().mockReturnValue({ select: selectMock });
      const eqIdMock = vi.fn().mockReturnValue({ eq: eqUserMock });
      const updateMock = vi.fn().mockReturnValue({ eq: eqIdMock });

      vi.mocked(supabase.from).mockReturnValue({
        update: updateMock,
      } as never);

      const updates = { title: "Updated Title" };
      const { prompt, error } = await updatePrompt("prompt-1", "user-1", updates);

      expect(supabase.from).toHaveBeenCalledWith("prompts");
      expect(updateMock).toHaveBeenCalledWith(updates);
      expect(updateMock.mock.calls[0][0]).not.toHaveProperty("updated_at");
      expect(eqIdMock).toHaveBeenCalledWith("id", "prompt-1");
      expect(eqUserMock).toHaveBeenCalledWith("user_id", "user-1");
      expect(error).toBeNull();
      expect(prompt).toEqual({ id: "prompt-1", title: "Updated Title" });
    });
  });
});

describe("Daily Upload Limit for Unverified Accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getUtcMidnightIso", () => {
    it("returns ISO string at 00:00:00.000Z for the current UTC day", () => {
      const iso = getUtcMidnightIso();
      const date = new Date(iso);
      expect(date.getUTCHours()).toBe(0);
      expect(date.getUTCMinutes()).toBe(0);
      expect(date.getUTCSeconds()).toBe(0);
      expect(date.getUTCMilliseconds()).toBe(0);
      expect(iso.endsWith("T00:00:00.000Z")).toBe(true);
    });
  });

  describe("getDailyUploadCount", () => {
    it("queries prompt_uploads table with user_id and gte created_at filter", async () => {
      const gteMock = vi.fn().mockResolvedValue({ count: 2, error: null });
      const eqMock = vi.fn().mockReturnValue({ gte: gteMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as never);

      const result = await getDailyUploadCount("user-123");

      expect(supabase.from).toHaveBeenCalledWith("prompt_uploads");
      expect(selectMock).toHaveBeenCalledWith("*", { count: "exact", head: true });
      expect(eqMock).toHaveBeenCalledWith("user_id", "user-123");
      expect(gteMock).toHaveBeenCalledWith("created_at", expect.stringMatching(/T00:00:00\.000Z$/));
      expect(result.count).toBe(2);
      expect(result.error).toBeNull();
    });

    it("returns count 0 if count is null or error occurs", async () => {
      const gteMock = vi.fn().mockResolvedValue({ count: null, error: { message: "DB Error" } });
      const eqMock = vi.fn().mockReturnValue({ gte: gteMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as never);

      const result = await getDailyUploadCount("user-123");

      expect(result.count).toBe(0);
      expect(result.error).toEqual({ message: "DB Error" });
    });
  });

  describe("checkDailyUploadLimit", () => {
    it("allows unlimited uploads for verified accounts", async () => {
      const result = await checkDailyUploadLimit("user-verified", true);

      expect(result.canUpload).toBe(true);
      expect(result.remaining).toBe(Infinity);
      expect(result.limit).toBe(Infinity);
      expect(result.isVerified).toBe(true);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("allows uploads for unverified accounts with 0 uploads today", async () => {
      const gteMock = vi.fn().mockResolvedValue({ count: 0, error: null });
      const eqMock = vi.fn().mockReturnValue({ gte: gteMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as never);

      const result = await checkDailyUploadLimit("user-unverified", false);

      expect(result.canUpload).toBe(true);
      expect(result.remaining).toBe(3);
      expect(result.uploadedToday).toBe(0);
      expect(result.limit).toBe(DAILY_UPLOAD_LIMIT_UNVERIFIED);
      expect(result.isVerified).toBe(false);
    });

    it("allows uploads when unverified account has 2 uploads (1 remaining)", async () => {
      const gteMock = vi.fn().mockResolvedValue({ count: 2, error: null });
      const eqMock = vi.fn().mockReturnValue({ gte: gteMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as never);

      const result = await checkDailyUploadLimit("user-unverified", false);

      expect(result.canUpload).toBe(true);
      expect(result.remaining).toBe(1);
      expect(result.uploadedToday).toBe(2);
      expect(result.limit).toBe(3);
      expect(result.isVerified).toBe(false);
    });

    it("blocks uploads when unverified account has reached 3 uploads (0 remaining)", async () => {
      const gteMock = vi.fn().mockResolvedValue({ count: 3, error: null });
      const eqMock = vi.fn().mockReturnValue({ gte: gteMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as never);

      const result = await checkDailyUploadLimit("user-unverified", false);

      expect(result.canUpload).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.uploadedToday).toBe(3);
      expect(result.limit).toBe(3);
      expect(result.isVerified).toBe(false);
    });

    it("blocks uploads when unverified account has exceeded limit", async () => {
      const gteMock = vi.fn().mockResolvedValue({ count: 5, error: null });
      const eqMock = vi.fn().mockReturnValue({ gte: gteMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as never);

      const result = await checkDailyUploadLimit("user-unverified", false);

      expect(result.canUpload).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.uploadedToday).toBe(5);
    });
  });


  describe("deletePrompt does not delete from prompt_uploads", () => {
    it("only deletes from prompts table, keeping prompt_uploads history intact", async () => {
      const deleteEqUserMock = vi.fn().mockResolvedValue({ error: null });
      const deleteEqIdMock = vi.fn().mockReturnValue({ eq: deleteEqUserMock });
      const deleteMock = vi.fn().mockReturnValue({ eq: deleteEqIdMock });

      const maybeSingleMock = vi.fn().mockResolvedValue({ data: { image_url: "https://example.test/img.png" } });
      const selectEqUserMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
      const selectEqIdMock = vi.fn().mockReturnValue({ eq: selectEqUserMock });
      const selectMock = vi.fn().mockReturnValue({ eq: selectEqIdMock });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === "prompts") {
          return {
            select: selectMock,
            delete: deleteMock,
          } as never;
        }
        return {} as never;
      });

      const { error } = await deletePrompt("prompt-1", "user-1");

      expect(error).toBeNull();
      // Verifies prompt was deleted from prompts table
      expect(supabase.from).toHaveBeenCalledWith("prompts");
      expect(deleteMock).toHaveBeenCalled();
      // prompt_uploads is never targeted for deletion
      expect(supabase.from).not.toHaveBeenCalledWith("prompt_uploads");
    });
  });
});
