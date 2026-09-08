import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PromptCard } from "./PromptCard";

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

  it("renders mobile drawer with complete actions including Copy Prompt and Like", () => {
    renderPromptCard(baseProps);

    const [mobileTrigger] = screen.getAllByLabelText("More options");
    fireEvent.click(mobileTrigger);

    // Mobile drawer contains all primary actions
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Like" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link" })).toBeInTheDocument();
    expect(screen.getByText("View Profile")).toBeInTheDocument();
    expect(screen.getByText("AI Tool:")).toBeInTheDocument();
    expect(screen.getAllByText("Midjourney").length).toBeGreaterThan(0);
  });

  it("renders desktop dropdown with complete actions including Copy Prompt and Like", () => {
    renderPromptCard(baseProps);

    const [, desktopTrigger] = screen.getAllByLabelText("More options");
    fireEvent.pointerDown(desktopTrigger, { button: 0, ctrlKey: false });
    fireEvent.keyDown(desktopTrigger, { key: "ArrowDown" });

    expect(screen.getByText("Copy Prompt")).toBeInTheDocument();
    expect(screen.getByText("Like")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Share")).toBeInTheDocument();
    expect(screen.getByText("Copy Link")).toBeInTheDocument();
    expect(screen.getByText("View Profile")).toBeInTheDocument();
    expect(screen.getByText("Tool:")).toBeInTheDocument();
  });

  it("includes touch hover-none override on copy button for touch screens like iPad Pro (#45)", () => {
    renderPromptCard(baseProps);

    const copyButton = screen.getByLabelText("Copy prompt");
    expect(copyButton.className).toContain("[@media(hover:none)]:!opacity-100");
  });
});
