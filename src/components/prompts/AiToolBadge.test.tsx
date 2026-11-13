import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AiToolBadge } from "./AiToolBadge";

describe("AiToolBadge", () => {
  it("renders abbreviated label initially with full tool name in title and aria-label", () => {
    render(<AiToolBadge tool="Stable Diffusion" />);

    const badge = screen.getByRole("button", { name: "AI tool: Stable Diffusion" });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", "Stable Diffusion");
    expect(badge).toHaveTextContent("SD");
  });

  it("toggles to full tool name on tap/click without needing hover/tooltip", () => {
    render(<AiToolBadge tool="NANO BANANA (Gemini)" />);

    const badge = screen.getByRole("button", { name: "AI tool: NANO BANANA (Gemini)" });
    expect(badge).toHaveTextContent("Nano Banana");

    // Tap/click to reveal full name
    fireEvent.click(badge);
    expect(badge).toHaveTextContent("NANO BANANA (Gemini)");
    expect(badge).toHaveAttribute("aria-expanded", "true");

    // Tap again to toggle back
    fireEvent.click(badge);
    expect(badge).toHaveTextContent("Nano Banana");
    expect(badge).toHaveAttribute("aria-expanded", "false");
  });

  it("renders custom tool names with fallback gracefully", () => {
    render(<AiToolBadge tool="Custom AI Engine" />);

    const badge = screen.getByRole("button", { name: "AI tool: Custom AI Engine" });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Custom AI Engine");
  });
});
