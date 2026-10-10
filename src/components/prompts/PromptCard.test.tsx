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

  it("keeps the image Like/Save group and Share button visible on touch tablets", () => {
    renderPromptCard(baseProps);

    // Pick the md+ image overlay controls, not the mobile title-row ones.
    const likeButtons = screen.getAllByLabelText("Like");
    const imageLikeGroup = likeButtons
      .map((button) => button.parentElement)
      .find((parent) => parent?.className.includes("md:flex"));
    expect(imageLikeGroup?.className).toContain("[@media(hover:none)]:!opacity-100");

    const imageShareButton = screen
      .getAllByLabelText("Share prompt")
      .find((button) => button.className.includes("md:flex"));
    expect(imageShareButton?.className).toContain("[@media(hover:none)]:!opacity-100");
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

    // Dropdown menu should be dismissed, avoiding lingering behind the dialog
    expect(screen.queryByRole("menu", { hidden: true })).not.toBeInTheDocument();

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const deleteButton = screen.getByRole("button", { name: "Delete" });
    expect(cancelButton).toBeInTheDocument();
    expect(deleteButton).toBeInTheDocument();

    // Clicking cancel should dismiss the dialog
    fireEvent.click(cancelButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Items that open a dialog must let the menu close first, or it stays open
  // behind the dialog and focus is lost when the dialog closes.
  it.each([
    ["Share", { id: "creator-1" }],
    ["Report", { id: "viewer-1" }],
  ])("closes the menu before opening the %s dialog", (label, viewer) => {
    mockUser = viewer;
    mockProfile = viewer;
    renderPromptCard(baseProps);

    const [, desktopTrigger] = screen.getAllByLabelText("More options");
    fireEvent.pointerDown(desktopTrigger, { button: 0, ctrlKey: false });
    fireEvent.keyDown(desktopTrigger, { key: "ArrowDown" });

    fireEvent.click(screen.getByRole("menuitem", { name: label }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("menu", { hidden: true })).not.toBeInTheDocument();
  });

  it("applies snappy transition tokens to card and image", () => {
    renderPromptCard(baseProps);

    const image = screen.getByAltText(baseProps.title);
    expect(image).toHaveClass("transition-transform", "duration-medium");

    const cardContainer = image.closest(".hover-lift");
    expect(cardContainer).toBeInTheDocument();
  });

  it("renders view count stat when viewCount is provided", () => {
    renderPromptCard({
      ...baseProps,
      viewCount: 150,
    });

    const viewsElement = screen.getByTitle("Views");
    expect(viewsElement).toBeInTheDocument();
    expect(viewsElement).toHaveTextContent("150");
  });

  // useAuth is mocked signed out above. Every gated action should open the sign
  // in dialog through onLoginRequired, not just show a toast.
  it.each([
    ["Copy prompt"],
    ["Like"],
    ["Save"],
  ])("asks a signed out user to sign in when they tap %s", (label) => {
    const onLoginRequired = vi.fn();
    renderPromptCard({ ...baseProps, onLoginRequired });

    fireEvent.click(screen.getAllByLabelText(label)[0]);

    expect(onLoginRequired).toHaveBeenCalledTimes(1);
  });
});
