import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Navbar } from "./Navbar";

const mockSignOut = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-123", email: "test@example.com" },
    profile: { id: "profile-123", username: "testuser", display_name: "Test User" },
    signOut: mockSignOut,
    loading: false,
  }),
}));

vi.mock("@/components/theme/ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle">ThemeToggle</div>,
}));

describe("Navbar Dropdown Menus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders desktop and mobile dropdown triggers when logged in", () => {
    const { container } = render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    // There should be avatar dropdown triggers
    const avatars = container.querySelectorAll("button");
    expect(avatars.length).toBeGreaterThan(0);
  });

  // The desktop menu is only about your account. Create and GitHub are
  // already in the navbar, and the site links moved to the footer.
  it("keeps the desktop dropdown to account items, headed by who is signed in", () => {
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    const desktopTrigger = screen.getAllByRole("button").filter((btn) => btn.className.includes("rounded-full"))[0];
    fireEvent.pointerDown(desktopTrigger, { button: 0, ctrlKey: false });
    fireEvent.keyDown(desktopTrigger, { key: "ArrowDown" });

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      "TTest User@testuser",
      "Saved",
      "Liked",
      "Settings",
      "Log out",
    ]);
    expect(items[0]).toHaveAttribute("href", "/profile/profile-123");
  });

  it("renders PARO Originals and Earn With PARO links with hover text contrast classes in mobile dropdown", async () => {
    const { container } = render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    // Open mobile dropdown (avatar trigger in mobile section)
    const mobileSection = container.querySelector(".flex.lg\\:hidden");
    const mobileAvatarButton = mobileSection?.querySelectorAll("button")[1];
    expect(mobileAvatarButton).toBeDefined();
    fireEvent.pointerDown(mobileAvatarButton!, { button: 0, ctrlKey: false });
    fireEvent.keyDown(mobileAvatarButton!, { key: "ArrowDown" });

    // Check PARO Originals link
    const originalsLinks = screen.getAllByRole("menuitem").filter(item => item.getAttribute("href") === "/originals");
    expect(originalsLinks.length).toBeGreaterThan(0);
    const originalsLink = originalsLinks[0] as HTMLElement;
    expect(originalsLink.className).toContain("group");
    expect(originalsLink.className).toContain("text-gold");

    const originalsIcon = originalsLink.querySelector("svg");
    expect(originalsIcon?.getAttribute("class")).toContain("group-hover:text-black");
    expect(originalsIcon?.getAttribute("class")).toContain("group-focus:text-black");

    const originalsSpan = originalsLink.querySelector("span");
    expect(originalsSpan?.className).toContain("group-hover:text-black");
    expect(originalsSpan?.className).toContain("group-focus:text-black");

    // Check Earn With PARO link
    const earnLinks = screen.getAllByRole("menuitem").filter(item => item.getAttribute("href") === "/earn");
    expect(earnLinks.length).toBeGreaterThan(0);
    const earnLink = earnLinks[0] as HTMLElement;
    expect(earnLink.className).toContain("group");
    expect(earnLink.className).toContain("text-gold");

    const earnIcon = earnLink.querySelector("svg");
    expect(earnIcon?.getAttribute("class")).toContain("group-hover:text-black");
    expect(earnIcon?.getAttribute("class")).toContain("group-focus:text-black");

    const earnSpan = earnLink.querySelector("span");
    expect(earnSpan?.className).toContain("group-hover:text-black");
    expect(earnSpan?.className).toContain("group-focus:text-black");
  });

  // Settings is where account deletion lives, so it has to be reachable from
  // both menus, not only through the Edit Profile button.
  it("links to Settings from the desktop and mobile dropdowns", () => {
    const { container } = render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    const desktopTrigger = screen.getAllByRole("button").filter((btn) => btn.className.includes("rounded-full"))[0];
    fireEvent.pointerDown(desktopTrigger, { button: 0, ctrlKey: false });
    fireEvent.keyDown(desktopTrigger, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/settings");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });

    const mobileSection = container.querySelector(".flex.lg\\:hidden");
    const mobileAvatarButton = mobileSection?.querySelectorAll("button")[1];
    fireEvent.pointerDown(mobileAvatarButton!, { button: 0, ctrlKey: false });
    fireEvent.keyDown(mobileAvatarButton!, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("renders Support link pointing to parostudio2026@gmail.com in mobile dropdown", async () => {
    const { container } = render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    const mobileSection = container.querySelector(".flex.lg\\:hidden");
    const mobileAvatarButton = mobileSection?.querySelectorAll("button")[1];
    expect(mobileAvatarButton).toBeDefined();

    fireEvent.pointerDown(mobileAvatarButton!, { button: 0, ctrlKey: false });
    fireEvent.keyDown(mobileAvatarButton!, { key: "ArrowDown" });

    const supportLink = screen.getByRole("menuitem", { name: /support/i });
    expect(supportLink).toBeDefined();
    expect(supportLink.getAttribute("href")).toBe("mailto:parostudio2026@gmail.com");
  });
});
