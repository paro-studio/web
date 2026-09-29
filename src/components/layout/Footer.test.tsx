import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Footer } from "./Footer";

describe("Footer", () => {
  // These used to live only in the account menu. On desktop the footer is now
  // the only place they are linked from, so keep them here.
  it.each([
    ["Top Creators", "/top-creators"],
    ["Earn With PARO", "/earn"],
    ["Community Guidelines", "/guidelines"],
    ["Feedback", "/feedback"],
  ])("links to %s", (name, href) => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  });
});
