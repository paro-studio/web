import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Privacy from "./Privacy";
import DeleteAccountInfo from "./DeleteAccountInfo";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, profile: null, signOut: vi.fn(), loading: false }),
}));

describe("Privacy and account deletion pages", () => {
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
