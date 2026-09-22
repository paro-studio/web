import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PromptDetail from "./PromptDetail";
import { supabase } from "@/services/supabase/client";
import { clearViewTracking } from "@/lib/viewTracking";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, profile: null, loading: false }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/services/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

const prompt = {
  id: "prompt-1",
  user_id: "user-1",
  title: "Test prompt",
  prompt: "A test prompt",
  image_url: "https://example.test/prompt.png",
  ai_tool: "Test tool",
  tags: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  view_count: 0,
  copy_count: 0,
};

const profile = {
  id: "user-1",
  username: "official",
  full_name: "PARO",
  avatar_url: null,
  cover_url: null,
  bio: null,
  created_at: null,
  updated_at: null,
  verified: true,
  website: null,
};

let activeProfile = profile;

function createQueryBuilder(table: string) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    match: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => ({
      data: table === "prompts" ? prompt : activeProfile,
      error: null,
    }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(
        table === "likes"
          ? { count: 0, error: null }
          : { data: [], error: null },
      ).then(resolve, reject),
  };

  return builder;
}

function renderPromptDetail(
  seedOrPromptId?: ((queryClient: QueryClient) => void) | string,
  promptIdArg = "prompt-1"
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const seed = typeof seedOrPromptId === "function" ? seedOrPromptId : undefined;
  const promptId = typeof seedOrPromptId === "string" ? seedOrPromptId : promptIdArg;

  seed?.(queryClient);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/prompt/${promptId}`]}>
        <Routes>
          <Route path="/prompt/:id" element={<PromptDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PromptDetail", () => {
  beforeEach(() => {
    localStorage.clear();
    clearViewTracking();
    vi.clearAllMocks();
    activeProfile = profile;
    vi.mocked(supabase.from).mockImplementation((table) => createQueryBuilder(table));
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null });
  });

  it("shows the verified badge for a verified creator", async () => {
    renderPromptDetail();

    expect(await screen.findByLabelText("Verified account")).toBeInTheDocument();
  });

  it("does not show the badge for an unverified creator", async () => {
    activeProfile = { ...profile, verified: false };
    renderPromptDetail();

    await screen.findByText("Test prompt");
    expect(screen.queryByLabelText("Verified account")).not.toBeInTheDocument();
  });

  it("renders the prompt accuracy rating widget and star buttons", async () => {
    renderPromptDetail();

    expect(await screen.findByText("Prompt Accuracy Rating")).toBeInTheDocument();
    expect(screen.getByText("How consistently this prompt delivers the expected result")).toBeInTheDocument();
    expect(screen.getByLabelText("Rate 5 stars")).toBeInTheDocument();
  });

  it("increments view count on first view and deduplicates on subsequent remounts", async () => {
    const { unmount } = renderPromptDetail();
    await screen.findByText("Test prompt");

    expect(supabase.rpc).toHaveBeenCalledWith("increment_view_count", {
      prompt_id: "prompt-1",
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);

    // Unmount and remount (simulating navigating back to feed and opening prompt again)
    unmount();
    renderPromptDetail();
    await screen.findByText("Test prompt");

    // View count RPC should not have been called a second time
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("increments view count for different prompts separately", async () => {
    const { unmount } = renderPromptDetail("prompt-1");
    await screen.findByText("Test prompt");

    expect(supabase.rpc).toHaveBeenCalledWith("increment_view_count", {
      prompt_id: "prompt-1",
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);

    unmount();
    renderPromptDetail("prompt-2");
    await screen.findByText("Test prompt");

    expect(supabase.rpc).toHaveBeenCalledWith("increment_view_count", {
      prompt_id: "prompt-2",
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });

  it("opens straight away from a card already in the feed cache", async () => {
    // Hold the real fetch open so only the cached card can be on screen.
    vi.mocked(supabase.from).mockImplementation(() => {
      const pending = new Promise(() => {});
      const builder = {
        select: () => builder, eq: () => builder, match: () => builder,
        order: () => builder, limit: () => builder,
        single: () => pending, maybeSingle: () => pending,
        then: (resolve: (v: unknown) => unknown) => pending.then(resolve),
      };
      return builder as never;
    });

    renderPromptDetail((queryClient) => {
      queryClient.setQueryData(["prompts", 50, null], [
        {
          id: "prompt-1",
          title: "Cached card",
          imageUrl: "https://example.test/prompt.png",
          toolUsed: "Test tool",
          viewCount: 3,
          copyCount: 2,
          createdAt: "2026-01-01T00:00:00.000Z",
          tags: [],
          creator: { id: "user-1", username: "official", displayName: "PARO", avatarUrl: null, verified: false },
          likeCount: 7,
          isLiked: true,
          isSaved: false,
          accuracyRating: null,
          ratingCount: 0,
        },
      ]);
    });

    expect(await screen.findByText("Cached card")).toBeInTheDocument();
    expect(screen.getByLabelText("Unlike")).toBeInTheDocument();
    expect(screen.getByTitle("Likes")).toHaveTextContent("7");
  });
});
