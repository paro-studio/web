import { describe, expect, it } from "vitest";
import { pagesToShow } from "./FeedPagination";

describe("pagesToShow", () => {
  it("shows every page when they fit", () => {
    expect(pagesToShow(1, 2)).toEqual([1, 2]);
    expect(pagesToShow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps the first, last and nearby pages when they don't", () => {
    expect(pagesToShow(1, 20)).toEqual([1, 2, null, 20]);
    expect(pagesToShow(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
    expect(pagesToShow(20, 20)).toEqual([1, null, 19, 20]);
  });
});
