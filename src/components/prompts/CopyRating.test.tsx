import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PromptCard } from "./PromptCard";
import PromptDetail from "@/pages/PromptDetail";

const mocks = vi.hoisted(() => ({ signedIn: true, copy: vi.fn(), rating: vi.fn(), submit: vi.fn(), increment: vi.fn(), toast: vi.fn(), login: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.signedIn ? { id: "viewer" } : null, profile: { id: "viewer" }, loading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/services/supabase/ratings", () => ({ getUserPromptRating: mocks.rating, ratePrompt: mocks.submit }));
vi.mock("@/services/supabase/prompts", () => ({ incrementCopyCount: mocks.increment }));
vi.mock("@/services/supabase/client", () => ({ supabase: { rpc: vi.fn().mockResolvedValue({ error: null }) } }));
vi.mock("@/components/layout/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/auth/AuthModal", () => ({ AuthModal: () => null }));
vi.mock("@/components/prompts/SharePromptDialog", () => ({ SharePromptDialog: () => null }));
vi.mock("@/components/prompts/ReportPromptDialog", () => ({ ReportPromptDialog: () => null }));

let nextId = 0;
const clients: QueryClient[] = [];
function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.hash}</output>;
}
function mount(view: "card" | "detail") {
  const prompt = { id: `copy-${nextId++}`, title: "Copy test", promptText: "A portrait", imageUrl: "image.png", toolUsed: "Test", tags: [], viewCount: 1, copyCount: 0, createdAt: "2026-01-01", creator: { id: "creator", username: "artist", displayName: "Artist", avatarUrl: null, verified: false }, likeCount: 0, isLiked: false, isSaved: false, accuracyRating: null, ratingCount: 0, userRating: null };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["prompt", prompt.id, "viewer"], prompt);
  // Keep this copy test focused on the copy/rating-entry boundary; query refresh is covered separately.
  vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/prompt/${prompt.id}`]}>
    <Location />
    {view === "card" ? <PromptCard {...prompt} onLoginRequired={mocks.login} /> : <Routes><Route path="/prompt/:id" element={<PromptDetail />} /></Routes>}
  </MemoryRouter></QueryClientProvider>);
}

describe("copy-to-rating entry points", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signedIn = true;
    mocks.copy.mockResolvedValue(undefined);
    mocks.increment.mockResolvedValue(undefined);
    mocks.rating.mockResolvedValue(null);
    mocks.submit.mockResolvedValue({ ratingInfo: { average: 4.7, count: 3 }, error: null });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.copy } });
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

  it.each(["card", "detail"] as const)("offers rating after a successful %s copy and stays dismissed on another copy", async view => {
    mount(view);
    expect(screen.queryByText("How accurate was this prompt?")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /copy prompt/i }));
    expect(await screen.findByText("How accurate was this prompt?")).toBeInTheDocument();
    expect(mocks.copy).toHaveBeenCalledWith("A portrait");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss rating invitation" }));
    fireEvent.click(screen.getByRole("button", { name: /copied/i }));
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("How accurate was this prompt?")).not.toBeInTheDocument();
    expect(mocks.rating).toHaveBeenCalledTimes(1);
  });

  it.each(["card", "detail"] as const)("does not offer rating or count a failed %s copy", async view => {
    mocks.copy.mockRejectedValue(new Error("clipboard blocked"));
    mount(view);
    fireEvent.click(screen.getByRole("button", { name: /copy prompt/i }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copy failed" })));
    expect(mocks.rating).not.toHaveBeenCalled();
    expect(mocks.increment).not.toHaveBeenCalled();
    expect(screen.queryByText("How accurate was this prompt?")).not.toBeInTheDocument();
  });

  it("takes the detail invitation to the existing rating controls", async () => {
    mount("detail");
    fireEvent.click(screen.getByRole("button", { name: /copy prompt/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Rate this prompt" }));
    expect(document.activeElement).toBe(document.getElementById("accuracy-rating"));
    expect(screen.getByRole("button", { name: "Rate 5 stars" })).toBeInTheDocument();
    expect(screen.queryByText("How accurate was this prompt?")).not.toBeInTheDocument();
  });

  it("asks a signed-out card viewer to sign in when they select the rating label", () => {
    mocks.signedIn = false;
    mount("card");
    fireEvent.click(screen.getByRole("button", { name: "Not yet rated" }));
    expect(mocks.login).toHaveBeenCalledOnce();
    expect(mocks.rating).not.toHaveBeenCalled();
  });

  it("links a signed-in card viewer to the rating section", () => {
    mount("card");
    fireEvent.click(screen.getByRole("button", { name: "Not yet rated" }));
    expect(screen.getByTestId("location").textContent).toMatch(/#accuracy-rating$/);
  });

  it("preserves sign-in before copying for a signed-out card viewer", () => {
    mocks.signedIn = false;
    mount("card");
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    expect(mocks.login).toHaveBeenCalledOnce();
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(mocks.rating).not.toHaveBeenCalled();
  });

  it("updates the displayed average after rating through the invitation", async () => {
    mount("detail");
    fireEvent.click(screen.getByRole("button", { name: /copy prompt/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Rate this prompt" }));
    fireEvent.click(screen.getByRole("button", { name: "Rate 4 stars" }));
    expect((await screen.findAllByText("4.7")).length).toBeGreaterThan(0);
    expect(mocks.submit).toHaveBeenCalledWith("viewer", expect.any(String), 4);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Rating recorded" }));
  });
});
