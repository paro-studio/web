import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Saved from "./Saved";
import Liked from "./Liked";
import PromptDetail from "./PromptDetail";
import { supabase } from "@/services/supabase/client";

const mocks = vi.hoisted(() => ({ profiles: vi.fn(), counts: vi.fn(), liked: vi.fn(), saved: vi.fn(), ratings: vi.fn(), profile: vi.fn() }));
const prompts = Array.from({ length: 60 }, (_, index) => ({ id: `p${index}`, userId: "creator", title: `Prompt ${index}`, promptText: "Text", imageUrl: "image.png", toolUsed: "Test", tags: ["portrait"], createdAt: "2026-01-01", viewCount: 0, copyCount: 0 }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "viewer" }, session: { user: { id: "viewer" } }, profile: { id: "viewer" }, loading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/services/supabase/client", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("@/components/layout/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/auth/AuthModal", () => ({ AuthModal: () => null }));
vi.mock("@/components/prompts/PromptCard", () => ({ PromptCard: (props: unknown) => <output data-testid="card">{JSON.stringify(props)}</output> }));
vi.mock("@/services/supabase/profiles", () => ({ getProfile: mocks.profile, getProfilesByIds: mocks.profiles }));
vi.mock("@/services/supabase/likes", () => ({ getUserLikes: async () => ({ prompts, error: null }), isLiked: async () => true, getLikeCounts: mocks.counts, getLikedPromptIds: mocks.liked }));
vi.mock("@/services/supabase/saves", () => ({ getUserSaves: async () => ({ prompts, error: null }), isSaved: async () => true, getSavedPromptIds: mocks.saved }));
vi.mock("@/services/supabase/ratings", () => ({ getPromptRatings: mocks.ratings }));

describe("card enrichment across collections and recommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const builder = {
      select: () => builder, order: () => builder, limit: () => builder,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: prompts.map(p => ({ id: p.id, user_id: p.userId, title: p.title, prompt: p.promptText, image_url: p.imageUrl, ai_tool: p.toolUsed, tags: p.tags, created_at: p.createdAt })), error: null }).then(resolve),
    };
    vi.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>);
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null });
    const profile = { id: "creator", username: "artist", full_name: "Artist", avatar_url: null, verified: true };
    mocks.profile.mockResolvedValue(profile);
    mocks.profiles.mockResolvedValue(new Map([["creator", profile]]));
    mocks.counts.mockResolvedValue(new Map(prompts.map(p => [p.id, 17])));
    mocks.liked.mockResolvedValue(new Set(prompts.map(p => p.id)));
    mocks.saved.mockResolvedValue(new Set(prompts.map(p => p.id)));
    mocks.ratings.mockResolvedValue(new Map(prompts.map(p => [p.id, { average: 4.5, count: 8 }])));
  });
  afterEach(cleanup);

  it.each(["saved", "liked", "recommendations"])("supplies complete data with bulk calls on %s", async (view) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    client.setQueryData(["prompt", "current", "viewer"], { ...prompts[0], id: "current", creator: { id: "creator", username: "artist", displayName: "Artist" }, likeCount: 0, isLiked: false, isSaved: false });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/prompt/current"]}>
      {view === "saved" ? <Saved /> : view === "liked" ? <Liked /> : <Routes><Route path="/prompt/:id" element={<PromptDetail />} /></Routes>}
    </MemoryRouter></QueryClientProvider>);
    if (view === "recommendations") {
      await waitFor(() => expect(client.getQueryState(["recommendations", "current", ["portrait"], "viewer"])?.fetchStatus).toBe("idle"));
      const queryError = client.getQueryState(["recommendations", "current", ["portrait"], "viewer"])?.error; if (queryError) throw queryError;
    }
    const cards = await screen.findAllByTestId("card");
    expect(cards).toHaveLength(view === "recommendations" ? 4 : 60);
    for (const card of cards) {
      expect(JSON.parse(card.textContent!)).toMatchObject({ likeCount: 17, accuracyRating: 4.5, ratingCount: 8, isLiked: true, isSaved: true, creator: { verified: true } });
    }
    const expectedRequests = view === "saved"
      ? [mocks.profiles, mocks.counts, mocks.liked, mocks.ratings]
      : view === "liked"
        ? [mocks.profiles, mocks.counts, mocks.saved, mocks.ratings]
        : [mocks.profiles, mocks.counts, mocks.liked, mocks.saved, mocks.ratings];
    for (const request of expectedRequests) expect(request).toHaveBeenCalledTimes(1);
    if (view === "saved") expect(mocks.saved).not.toHaveBeenCalled();
    if (view === "liked") expect(mocks.liked).not.toHaveBeenCalled();
    expect(mocks.profile).not.toHaveBeenCalled();
  });
});
