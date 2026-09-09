import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import Settings from "./Settings";

const mockUser = { id: "user-uuid-1234", email: "user@example.com" };
const mockProfile = {
  id: "user-uuid-1234",
  username: "testuser",
  display_name: "Test User",
  bio: "Test bio",
  avatar_url: null,
  cover_url: null,
};

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    session: { user: mockUser },
    profile: mockProfile,
    refreshProfile: vi.fn(),
    loading: false,
  }),
}));

vi.mock("@/components/layout/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar">Navbar</nav>,
}));

vi.mock("@/components/layout/Footer", () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>,
}));

describe("Settings Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders profile URL helper text matching the actual UUID-based route and domain", () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    const helperText = screen.getByText(`parostudios.in/profile/${mockUser.id}`);
    expect(helperText).toBeDefined();
  });
});
