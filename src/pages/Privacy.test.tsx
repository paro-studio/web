import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Privacy from "./Privacy";
import DeleteAccountInfo from "./DeleteAccountInfo";
import Terms from "./Terms";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, profile: null, signOut: vi.fn(), loading: false }),
}));

describe("Privacy, terms and account deletion pages", () => {
  it("renders the privacy policy, public to signed out visitors", () => {
    render(
      <MemoryRouter>
        <Privacy />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What is public" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "how to delete your account" })).toHaveAttribute(
      "href",
      "/delete-account"
    );
  });

  it("renders the terms of use with the posting rules and links to the other policies", () => {
    render(
      <MemoryRouter>
        <Terms />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Terms of Use" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What is not allowed" })).toBeInTheDocument();
    expect(screen.getByText("Nudity or sexually explicit images.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "privacy policy" })).toHaveAttribute("href", "/privacy");
  });

  it("explains how to delete an account in the app and on the website", () => {
    render(
      <MemoryRouter>
        <DeleteAccountInfo />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Delete your Paro Studio account" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "In the app" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "On the website" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });
});
