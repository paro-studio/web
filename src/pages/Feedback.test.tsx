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
  it("renders page layout and content", () => {
    render(
      <MemoryRouter>
        <Feedback />
      </MemoryRouter>
    );

    expect(screen.getByTestId("navbar")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
  });

  it("renders heading 'We'd love to hear from you'", () => {
    render(
      <MemoryRouter>
        <Feedback />
      </MemoryRouter>
    );

    expect(screen.getByText(/We'd love to hear from you/i)).toBeInTheDocument();
  });

  it("renders 'Send a Message' heading", () => {
    render(
      <MemoryRouter>
        <Feedback />
      </MemoryRouter>
    );

    expect(screen.getByText(/Send a Message/i)).toBeInTheDocument();
  });

  it("renders FeedbackForm component", () => {
    render(
      <MemoryRouter>
        <Feedback />
      </MemoryRouter>
    );

    expect(screen.getByTestId("feedback-form")).toBeInTheDocument();
  });

  it("renders email contact link as fallback", () => {
    render(
      <MemoryRouter>
        <Feedback />
      </MemoryRouter>
    );

    const emailLink = screen.getByRole("link", { name: "parostudio2026@gmail.com" });
    expect(emailLink).toBeInTheDocument();
    expect(emailLink.getAttribute("href")).toBe("mailto:parostudio2026@gmail.com");
  });

  it("renders 'Email Us' contact card on desktop", () => {
    render(
      <MemoryRouter>
        <Feedback />
      </MemoryRouter>
    );

    expect(screen.getByText(/Email Us/i)).toBeInTheDocument();
  });
});
