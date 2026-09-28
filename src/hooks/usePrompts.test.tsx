import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePrompts } from "./usePrompts";
import { getAllPrompts, searchPrompts } from "@/services/supabase/prompts";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, sessionLoading: false }),
}));

vi.mock("@/services/supabase/prompts", () => ({
  getAllPrompts: vi.fn(),
  getRecentPromptCreatorIds: vi.fn(),
  searchPrompts: vi.fn(),
}));

vi.mock("@/services/supabase/profiles", () => ({
  getProfilesByIds: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/services/supabase/likes", () => ({
  getLikeCounts: vi.fn().mockResolvedValue(new Map()),
  getLikedPromptIds: vi.fn().mockResolvedValue(new Set()),
}));

vi.mock("@/services/supabase/saves", () => ({
  getSavedPromptIds: vi.fn().mockResolvedValue(new Set()),
}));

vi.mock("@/services/supabase/ratings", () => ({
  getPromptRatings: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/services/supabase/follows", () => ({
  getFollowerCounts: vi.fn().mockResolvedValue(new Map()),
}));

const rows = [
  { id: "a", userId: "u1", title: "A", imageUrl: "", toolUsed: "", tags: ["city"], createdAt: "2026-01-01T00:00:00Z", viewCount: 5, copyCount: 1 },
  { id: "b", userId: "u1", title: "B", imageUrl: "", toolUsed: "", tags: ["art"], createdAt: "2026-01-03T00:00:00Z", viewCount: 1, copyCount: 9 },
  { id: "c", userId: "u2", title: "C", imageUrl: "", toolUsed: "", tags: ["city"], createdAt: "2026-01-02T00:00:00Z", viewCount: 9, copyCount: 0 },
];

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("usePrompts", () => {
  beforeEach(() => {
    vi.mocked(getAllPrompts).mockReset().mockResolvedValue({ prompts: rows, error: null });
    vi.mocked(searchPrompts).mockReset().mockResolvedValue({ prompts: rows, error: null });
  });

  it("re-sorts and filters cached rows without fetching again", async () => {
    const { result, rerender } = renderHook(
      (props: Parameters<typeof usePrompts>[0]) => usePrompts(props),
      { wrapper, initialProps: { sortBy: "trending" } }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    // Trending score is views + copies * 3 + likes * 2: b 28, c 9, a 8.
    expect(result.current.data?.map((p) => p.id)).toEqual(["b", "c", "a"]);

    rerender({ sortBy: "newest" });
    expect(result.current.data?.map((p) => p.id)).toEqual(["b", "c", "a"]);

    rerender({ sortBy: "most_copied", selectedTags: ["city"] });
    expect(result.current.data?.map((p) => p.id)).toEqual(["a", "c"]);
    expect(result.current.isLoading).toBe(false);

    expect(getAllPrompts).toHaveBeenCalledTimes(1);
  });

  it("queries searchPrompts using server-side search when searchQuery is provided", async () => {
    vi.mocked(searchPrompts).mockResolvedValue({ prompts: [rows[0]], error: null });

    const { result } = renderHook(
      () => usePrompts({ searchQuery: "cyberpunk", selectedTags: ["city"] }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(searchPrompts).toHaveBeenCalledWith({
      query: "cyberpunk",
      tags: ["city"],
      limit: 100,
    });
    expect(result.current.data?.map((p) => p.id)).toEqual(["a"]);
  });

  it("queries searchPrompts using server-side tag filtering when only selectedTags are provided", async () => {
    vi.mocked(searchPrompts).mockResolvedValue({ prompts: [rows[0]], error: null });

    const { result } = renderHook(
      () => usePrompts({ selectedTags: ["city"] }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(searchPrompts).toHaveBeenCalledWith({
      query: undefined,
      tags: ["city"],
      limit: 100,
    });
    expect(result.current.data?.map((p) => p.id)).toEqual(["a"]);
  });
});
