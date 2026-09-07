import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PromptCard } from "./PromptCard";

let mockUser: { id: string } | null = null;
let mockProfile: { id: string } | null = null;

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser, profile: mockProfile, loading: false }),
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

function renderPromptCard(props: React.ComponentProps<typeof PromptCard>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PromptCard {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PromptCard", () => {
  const baseProps = {
    id: "prompt-1",
    title: "Cinematic portrait",
    promptText: "A realistic portrait, 8k, photorealistic",
    imageUrl: "https://example.test/portrait.png",
    toolUsed: "Midjourney",
    copyCount: 12,
    likeCount: 34,
    creator: {
      id: "creator-1",
      username: "artist",
      displayName: "Digital Artist",
      avatarUrl: null,
      verified: true,
    },
    tags: ["portrait", "realistic"],
  };

  beforeEach(() => {
    mockUser = null;
    mockProfile = null;
  });

  it("renders accuracy rating when provided explicitly with ratingCount > 0", () => {
    renderPromptCard({
      ...baseProps,
      accuracyRating: 4.8,
      ratingCount: 20,
    });

    const ratingElement = screen.getByLabelText("Prompt Accuracy: 4.8 out of 5 stars");
    expect(ratingElement).toBeInTheDocument();
    expect(ratingElement).toHaveTextContent("4.8");
  });

  it("renders 'Not yet rated' when accuracyRating or ratingCount is omitted / 0", () => {
    renderPromptCard(baseProps);

    const ratingElement = screen.getByLabelText("Not yet rated");
    expect(ratingElement).toBeInTheDocument();
    expect(ratingElement).toHaveTextContent("Not rated");
  });

  it("renders mobile menu trigger with legible overlay styling without hardcoded text-black", () => {
    renderPromptCard(baseProps);

    const [mobileTrigger] = screen.getAllByLabelText("More options");
    expect(mobileTrigger).toBeInTheDocument();
    expect(mobileTrigger.className).toContain("rounded-full");
    expect(mobileTrigger.className).toContain("backdrop-blur-sm");
    expect(mobileTrigger.className).not.toContain("text-black");
  });

  it("opens delete confirmation in an accessible Radix dialog for prompt owner", async () => {
    mockUser = { id: "creator-1" };
    mockProfile = { id: "creator-1" };
    renderPromptCard(baseProps);

    // Click desktop dropdown trigger (second "More options" button) to view owner actions
    const [, desktopTrigger] = screen.getAllByLabelText("More options");
    fireEvent.pointerDown(desktopTrigger, { button: 0, ctrlKey: false });
    fireEvent.keyDown(desktopTrigger, { key: "ArrowDown" });

    const deleteMenuItem = screen.getByText("Delete");
    fireEvent.click(deleteMenuItem);

    // Radix dialog should be present with role="dialog"
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Delete Prompt?")).toBeInTheDocument();
    expect(
      screen.getByText("This will permanently delete this prompt and its image. This cannot be undone.")
    ).toBeInTheDocument();

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const deleteButton = screen.getByRole("button", { name: "Delete" });
    expect(cancelButton).toBeInTheDocument();
    expect(deleteButton).toBeInTheDocument();

    // Clicking cancel should dismiss the dialog
    fireEvent.click(cancelButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
