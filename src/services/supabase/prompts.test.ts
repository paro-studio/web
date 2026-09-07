import { describe, it, expect, beforeEach, vi } from "vitest";
import { getAllPrompts, getUserPrompts, searchPrompts } from "./prompts";
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

  describe("searchPrompts", () => {
    it("searches by query using textSearch on fts index", async () => {
      const limitMock = vi.fn().mockResolvedValue({
        data: [mockDbPrompts[0]],
        error: null,
      });
      const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
      const textSearchMock = vi.fn().mockReturnValue({ order: orderMock });
      const selectMock = vi.fn().mockReturnValue({ textSearch: textSearchMock });

      vi.mocked(supabase.from).mockReturnValue({
        select: selectMock,
      } as never);

      const { prompts, error } = await searchPrompts({ query: "cyberpunk", limit: 10 });

      expect(supabase.from).toHaveBeenCalledWith("prompts");
      expect(selectMock).toHaveBeenCalledWith("*");
      expect(textSearchMock).toHaveBeenCalledWith("fts", "cyberpunk", {
        config: "english",
        type: "websearch",
      });
      expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: false });
      expect(limitMock).toHaveBeenCalledWith(10);
      expect(error).toBeNull();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].title).toBe("Cyberpunk City");
    });

    it("filters by tags using overlaps on tags index", async () => {
      const limitMock = vi.fn().mockResolvedValue({
        data: [mockDbPrompts[0]],
        error: null,
      });
      const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
      const overlapsMock = vi.fn().mockReturnValue({ order: orderMock });
      const selectMock = vi.fn().mockReturnValue({ overlaps: overlapsMock });

      vi.mocked(supabase.from).mockReturnValue({
        select: selectMock,
      } as never);

      const { prompts, error } = await searchPrompts({ tags: ["cyberpunk", "city"] });

      expect(supabase.from).toHaveBeenCalledWith("prompts");
      expect(selectMock).toHaveBeenCalledWith("*");
      expect(overlapsMock).toHaveBeenCalledWith("tags", ["cyberpunk", "city"]);
      expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: false });
      expect(limitMock).toHaveBeenCalledWith(50);
      expect(error).toBeNull();
      expect(prompts).toHaveLength(1);
    });

    it("combines textSearch and overlaps when both query and tags are provided", async () => {
      const limitMock = vi.fn().mockResolvedValue({
        data: [mockDbPrompts[0]],
        error: null,
      });
      const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
      const overlapsMock = vi.fn().mockReturnValue({ order: orderMock });
      const textSearchMock = vi.fn().mockReturnValue({ overlaps: overlapsMock });
      const selectMock = vi.fn().mockReturnValue({ textSearch: textSearchMock });

      vi.mocked(supabase.from).mockReturnValue({
        select: selectMock,
      } as never);

      const { prompts, error } = await searchPrompts({ query: "cyberpunk", tags: ["city"] });

      expect(textSearchMock).toHaveBeenCalledWith("fts", "cyberpunk", {
        config: "english",
        type: "websearch",
      });
      expect(overlapsMock).toHaveBeenCalledWith("tags", ["city"]);
      expect(error).toBeNull();
      expect(prompts).toHaveLength(1);
    });
  });
});
