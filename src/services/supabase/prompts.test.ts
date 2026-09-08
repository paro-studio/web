import { describe, it, expect, beforeEach, vi } from "vitest";
import { getAllPrompts, getUserPrompts, updatePrompt } from "./prompts";
import { supabase } from "./client";

vi.mock("./client", () => ({
  supabase: {
    from: vi.fn(),
  },
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
