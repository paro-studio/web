import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Index from "./Index";

let mockPrompts: unknown[] = [];
let mockLoading = false;

vi.mock("@/hooks/usePrompts", () => ({
  usePrompts: () => ({
    data: mockPrompts,
    isLoading: mockLoading,
  }),
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

function renderIndex(initialEntries = ["/"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Index />
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
