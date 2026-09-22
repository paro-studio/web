import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Profile from "./Profile";
import { supabase } from "@/services/supabase/client";

const mockAuthState = {
  user: null as { id: string } | null,
  profile: null as { id: string; username: string } | null,
  loading: false,
};

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockAuthState,
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

const mockProfile = {
  id: "user-1",
  username: "creator_jane",
  full_name: "Jane Doe",
  avatar_url: "https://example.test/avatar.png",
  cover_url: "https://example.test/cover.png",
  bio: "Prompt engineer & creator",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  verified: true,
  website: null,
};

const mockPrompts = [
  {
    id: "prompt-1",
    user_id: "user-1",
    title: "Futuristic Cyberpunk City",
    prompt: "Cyberpunk cityscape neon lights 8k",
    image_url: "https://example.test/cyberpunk.png",
    ai_tool: "Midjourney",
    tags: ["cyberpunk", "city"],
    created_at: "2026-01-02T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    view_count: 42,
    copy_count: 7,
  },
];

let currentPromptsData = mockPrompts;

function createQueryBuilder(table: string) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    match: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => ({
      data: table === "profiles" ? mockProfile : currentPromptsData[0] || null,
      error: null,
    }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(
        table === "prompts"
          ? { data: currentPromptsData, error: null }
          : table === "profiles"
          ? { data: [mockProfile], error: null }
          : { data: [], count: 0, error: null },
      ).then(resolve, reject),
  };

  return builder;
}

function renderProfile() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/profile/user-1"]}>
        <Routes>
          <Route path="/profile/:id" element={<Profile />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Profile Page", () => {
  beforeEach(() => {
    currentPromptsData = mockPrompts;
    mockAuthState.user = null;
    mockAuthState.profile = null;
    vi.mocked(supabase.from).mockImplementation((table) => createQueryBuilder(table));
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null });
  });

  it("renders prompt cards with the correct image URL instead of broken images", async () => {
    renderProfile();

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(await screen.findByText("Futuristic Cyberpunk City")).toBeInTheDocument();

    const promptImage = await screen.findByAltText("Futuristic Cyberpunk City");
    expect(promptImage).toBeInTheDocument();
    expect(promptImage).toHaveAttribute("src", "https://example.test/cyberpunk.png");
  });

  it("renders upload invitation on own empty profile", async () => {
    currentPromptsData = [];
    mockAuthState.user = { id: "user-1" };
    mockAuthState.profile = { id: "user-1", username: "creator_jane" };

    renderProfile();

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(await screen.findByText("You haven't posted any prompts yet")).toBeInTheDocument();

    const uploadLink = await screen.findByRole("link", { name: /post your first prompt/i });
    expect(uploadLink).toBeInTheDocument();
    expect(uploadLink).toHaveAttribute("href", "/upload");
  });

  it("renders plain 'No prompts yet' on other user's empty profile without upload invitation", async () => {
    currentPromptsData = [];
    mockAuthState.user = { id: "user-other" };
    mockAuthState.profile = { id: "user-other", username: "other_user" };

    renderProfile();

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(await screen.findByText("No prompts yet")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /post your first prompt/i })).not.toBeInTheDocument();
  });
});
