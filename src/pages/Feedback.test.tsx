import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Feedback from "./Feedback";

vi.mock("@/components/layout/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar">Navbar</nav>,
}));

vi.mock("@/components/layout/Footer", () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>,
}));

vi.mock("@/components/profile/FeedbackForm", () => ({
  FeedbackForm: () => <div data-testid="feedback-form">FeedbackForm</div>,
}));

describe("Feedback Page", () => {
  it("renders consistent support email with mailto link", () => {
    render(
      <MemoryRouter>
        <Feedback />
      </MemoryRouter>
    );

    const emailLink = screen.getByRole("link", { name: "support@parostudios.in" });
    expect(emailLink).toBeDefined();
    expect(emailLink.getAttribute("href")).toBe("mailto:support@parostudios.in");
  });
});
