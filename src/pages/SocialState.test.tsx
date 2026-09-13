import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PromptDetail from "./PromptDetail";
import Profile from "./Profile";
import { PromptCard } from "@/components/prompts/PromptCard";

const mocks = vi.hoisted(() => ({ toggleLike: vi.fn(), toggleSave: vi.fn(), toggleFollow: vi.fn(), toast: vi.fn(), getPrompt: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "viewer" }, profile: { id: "viewer" }, loading: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/layout/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/auth/AuthModal", () => ({ AuthModal: () => null }));
vi.mock("@/services/supabase/prompts", () => ({
  getPrompt: mocks.getPrompt,
  incrementViewCount: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/supabase/likes", () => ({ toggleLike: mocks.toggleLike }));
vi.mock("@/services/supabase/saves", () => ({ toggleSave: mocks.toggleSave }));
vi.mock("@/services/supabase/follows", () => ({
  toggleFollow: mocks.toggleFollow, getFollowerCount: async () => 12, isFollowing: async () => true,
}));
vi.mock("@/services/supabase/client", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const prompt = {
  id: "prompt-1", title: "Cached portrait", promptText: "A portrait",
  imageUrl: "https://example.test/portrait.png", toolUsed: "Test", tags: [],
  viewCount: 10, copyCount: 3, createdAt: "2026-01-01T00:00:00Z",
  creator: { id: "creator", username: "artist", displayName: "Artist", avatarUrl: null, verified: false },
  isLiked: true, isSaved: true, likeCount: 17, accuracyRating: 4.5, ratingCount: 2, userRating: 5,
};

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } } });
}

describe("social state from server data", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("reopens a fresh cached prompt with its liked, saved, count and rating values", () => {
    const queryClient = client();
    queryClient.setQueryData(["prompt", prompt.id, "viewer"], prompt);
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[`/prompt/${prompt.id}`]}>
      <Routes><Route path="/prompt/:id" element={<PromptDetail />} /></Routes>
    </MemoryRouter></QueryClientProvider>);
    expect(mocks.getPrompt).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Unlike" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unsave" })).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("5 / 5")).toBeInTheDocument();
  });

  it("updates an already mounted card when the parent receives new server data", () => {
    const queryClient = client();
    const card = (liked: boolean) => <QueryClientProvider client={queryClient}><MemoryRouter>
      <PromptCard {...prompt} isLiked={liked} isSaved={liked} likeCount={liked ? 17 : 16} />
    </MemoryRouter></QueryClientProvider>;
    const view = render(card(false));
    expect(screen.getAllByRole("button", { name: "Like" }).length).toBeGreaterThan(0);
    view.rerender(card(true));
    expect(screen.getAllByRole("button", { name: "Unlike" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Unsave" })).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
  });

  it("restores a card's like and count when the service returns an error", async () => {
    mocks.toggleLike.mockResolvedValue({ liked: false, error: new Error("Network unavailable") });
    render(<QueryClientProvider client={client()}><MemoryRouter><PromptCard {...prompt} /></MemoryRouter></QueryClientProvider>);
    fireEvent.click(screen.getAllByRole("button", { name: "Unlike" })[0]);
    await waitFor(() => expect(mocks.toggleLike).toHaveBeenCalledWith("viewer", prompt.id));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Unlike" }).length).toBeGreaterThan(0));
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("restores a cached profile's follow status and follower count after a failed unfollow", async () => {
    mocks.toggleFollow.mockResolvedValue({ error: new Error("Network unavailable") });
    const queryClient = client();
    queryClient.setQueryData(["profile", "creator"], { id: "creator", username: "artist", display_name: "Artist" });
    queryClient.setQueryData(["profile-prompts", "creator", "viewer"], []);
    queryClient.setQueryData(["follower-count", "creator", "viewer"], { count: 12, following: true });
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/profile/creator"]}>
      <Routes><Route path="/profile/:id" element={<Profile />} /></Routes>
    </MemoryRouter></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Following" }));
    await waitFor(() => expect(mocks.toggleFollow).toHaveBeenCalledWith("viewer", "creator"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Following" })).toBeInTheDocument());
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });
});
