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

  it("renders Earn With PARO link with hover text contrast classes in desktop dropdown", async () => {
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    // Open desktop dropdown (first avatar trigger)
    const avatarButtons = screen.getAllByRole("button").filter(
      (btn) => btn.querySelector("span")?.textContent?.includes("T") || btn.className.includes("rounded-full")
    );
    
    fireEvent.pointerDown(avatarButtons[0], { button: 0, ctrlKey: false });
    fireEvent.keyDown(avatarButtons[0], { key: "ArrowDown" });

    // Check Earn With PARO links rendered (DropdownMenuItem with asChild places role="menuitem" directly on the Link)
    const earnLinks = screen.getAllByRole("menuitem").filter(item => item.getAttribute("href") === "/earn");
    expect(earnLinks.length).toBeGreaterThan(0);

    const earnLink = earnLinks[0] as HTMLElement;
    expect(earnLink.className).toContain("group");
    expect(earnLink.className).toContain("text-gold");

    const icon = earnLink.querySelector("svg");
    expect(icon?.getAttribute("class")).toContain("group-hover:text-black");
    expect(icon?.getAttribute("class")).toContain("group-focus:text-black");

    const span = earnLink.querySelector("span");
    expect(span?.className).toContain("group-hover:text-black");
    expect(span?.className).toContain("group-focus:text-black");
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

  it("renders Support link pointing to support@parostudios.in in mobile dropdown", async () => {
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
    expect(supportLink.getAttribute("href")).toBe("mailto:support@parostudios.in");
  });
});
