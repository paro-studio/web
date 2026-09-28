import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Saved from "./Saved";
import Liked from "./Liked";
import Index from "./Index";
import Profile from "./Profile";
import TopCreators from "./TopCreators";
import Settings from "./Settings";
import Upload from "./Upload";
import { ProtectedRoute } from "@/components/routing/ProtectedRoute";
import { supabase } from "@/services/supabase/client";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { PageSkeleton } from "@/components/PageSkeleton";

const auth = vi.hoisted(() => ({ loading: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "viewer" }, session: { user: { id: "viewer" } }, profile: { id: "viewer" }, loading: auth.loading }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/services/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/components/layout/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/auth/AuthModal", () => ({ AuthModal: () => null }));
vi.mock("@/components/prompts/EditPromptModal", () => ({ EditPromptModal: () => null }));
vi.mock("@/components/prompts/PromptCard", () => ({ PromptCard: ({ title }: { title: string }) => <article>{title}</article> }));
vi.mock("@/components/feed", () => ({ FeedCard: () => null }));
vi.mock("@/components/prompts/TagFilter", () => ({ TagFilter: () => null }));
vi.mock("@/services/supabase/profiles", () => ({ getProfile: async () => ({ id: "creator", username: "artist", full_name: "Artist" }), getProfilesByIds: async () => new Map() }));
vi.mock("@/services/supabase/follows", () => ({ getFollowerCount: async () => 0, isFollowing: async () => false, getFollowerCounts: async () => new Map() }));

let failed = true;
const clients: QueryClient[] = [];
function mount(page: React.ReactNode, savedData?: unknown[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  if (savedData) client.setQueryData(["saved-prompts", "viewer"], savedData);
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/profile/creator"]}>
    <Routes><Route path="/profile/:id" element={page} /></Routes>
  </MemoryRouter></QueryClientProvider>);
  return client;
}

describe("safe query errors on screens", () => {
  beforeEach(() => {
    failed = true;
    auth.loading = false;
    const builder = {
      select: () => builder, order: () => builder, limit: () => builder, eq: () => builder, in: () => builder,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(failed
        ? { data: null, error: { message: "private database detail", code: "503" } }
        : { data: [], error: null }).then(resolve),
    };
    vi.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>);
  });
  afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

  it.each([
    { name: "Saved", page: <Saved />, empty: "No saved prompts yet" },
    { name: "Liked", page: <Liked />, empty: "No liked prompts yet" },
    { name: "feed", page: <Index />, empty: "No prompts yet" },
    { name: "profile prompts", page: <Profile />, empty: "No prompts yet" },
    { name: "creators", page: <TopCreators />, empty: "No creators yet" },
  ])("distinguishes failure from empty data and retries on $name", async ({ page, empty }) => {
    mount(page);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Please try again");
    expect(document.body).not.toHaveTextContent("private database detail");
    expect(screen.queryByText(empty)).not.toBeInTheDocument();
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(empty)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("preserves previously loaded cards when refreshing fails", async () => {
    mount(<Saved />, [{ id: "p1", title: "Still saved", creator: { id: "creator" } }]);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Still saved")).toBeInTheDocument();
    expect(screen.queryByText("No saved prompts yet")).not.toBeInTheDocument();
  });

  it("catches rendering failures without exposing the exception", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    function Broken(): never { throw new Error("private database detail"); }
    try {
      render(<AppErrorBoundary><Broken /></AppErrorBoundary>);
      expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
      expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent("private database detail");
    } finally { consoleError.mockRestore(); }
  });

  it("announces loading with a skeleton instead of visible loading text", () => {
    render(<PageSkeleton />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading page");
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it.each([
    { name: "Saved", page: <Saved /> }, { name: "Liked", page: <Liked /> },
    { name: "Settings", page: <Settings /> }, { name: "Upload", page: <Upload /> },
    { name: "auth gate", page: <ProtectedRoute><p>Protected content</p></ProtectedRoute> },
  ])("shows the loading skeleton on $name", ({ page }) => {
    auth.loading = true;
    mount(page);
    expect(screen.getByRole("status")).toHaveTextContent("Loading page");
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });
});
