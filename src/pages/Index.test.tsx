import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Index from "./Index";

let mockPrompts: unknown[] = [];
let mockLoading = false;
let mockHasNextPage = false;
let requestedPage: number | undefined;

vi.mock("@/hooks/usePrompts", () => ({
  usePrompts: (options: { page?: number }) => {
    requestedPage = options.page;
    return {
      data: mockPrompts,
      isLoading: mockLoading,
      hasNextPage: mockHasNextPage,
    };
  },
}));

vi.mock("@/components/feed", () => ({
  FeedCard: () => <article>card</article>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, profile: null, loading: false }),
}));

vi.mock("@/services/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="url">{location.search}</output>;
}

function renderIndex(initialEntries = ["/"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Index />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Index Page empty states", () => {
  beforeEach(() => {
    mockPrompts = [];
    mockLoading = false;
  });

  it("renders upload invitation when no prompts exist in the feed", () => {
    renderIndex();

    expect(screen.getByText("No prompts yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Be the first to share your creative prompt and inspire the community/i)
    ).toBeInTheDocument();

    const postButton = screen.getByRole("link", { name: /post a prompt/i });
    expect(postButton).toBeInTheDocument();
    expect(postButton).toHaveAttribute("href", "/upload");
  });

  it("renders 'No prompts found' and clear filters button when filters match nothing", () => {
    renderIndex(["/?tag=cyberpunk"]);

    expect(screen.getByText("No prompts found")).toBeInTheDocument();
    expect(screen.getByText("Try adjusting your search or filters")).toBeInTheDocument();

    const clearButton = screen.getByRole("button", { name: /clear filters/i });
    expect(clearButton).toBeInTheDocument();

    // Clicking clear filters clears the tags
    fireEvent.click(clearButton);
    expect(screen.getByText("No prompts yet")).toBeInTheDocument();
  });
});

describe("Index Page pagination", () => {
  const prompt = {
    id: "p1",
    title: "A prompt",
    imageUrl: "",
    toolUsed: "",
    viewCount: 0,
    copyCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    tags: [],
    creator: { id: "c", username: "c", displayName: "C", avatarUrl: null, verified: false },
    likeCount: 0,
    isLiked: false,
    isSaved: false,
  };

  beforeEach(() => {
    mockPrompts = [prompt];
    mockLoading = false;
    mockHasNextPage = false;
    window.scrollTo = vi.fn();
  });

  it("hides the pager when everything fits on one page", () => {
    renderIndex();

    expect(screen.queryByRole("navigation", { name: "Feed pages" })).not.toBeInTheDocument();
  });

  it("moves to the next page through the URL and back to the top of the page", () => {
    mockHasNextPage = true;
    renderIndex();

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByTestId("url")).toHaveTextContent("?page=2");
    expect(requestedPage).toBe(2);
    expect(screen.getByText("Page 2")).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  });

  it("disables Next on the last page and drops the param going back to page one", () => {
    renderIndex(["/?page=2"]);

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    expect(screen.getByTestId("url")).toBeEmptyDOMElement();
    expect(requestedPage).toBe(1);
  });

  it.each(["0", "-1", "abc", "1.5"])("treats ?page=%s as the first page", (value) => {
    renderIndex([`/?page=${value}`]);

    expect(requestedPage).toBe(1);
  });

  it("offers a way back from a page past the end", () => {
    mockPrompts = [];
    renderIndex(["/?page=9"]);

    expect(screen.getByText("There's nothing on this page")).toBeInTheDocument();
    expect(screen.queryByText("No prompts yet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to the first page" }));
    expect(requestedPage).toBe(1);
  });
});
