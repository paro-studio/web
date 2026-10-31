import { describe, expect, it } from "vitest";
import { rankRelatedPrompts } from "./relatedPrompts";

const prompt = (id: string, tags: string[], createdAt = "2026-01-01T00:00:00Z") => ({ id, tags, createdAt });
const ids = (rows: { id: string }[]) => rows.map((p) => p.id);

describe("rankRelatedPrompts", () => {
  const current = { id: "current", tags: ["photoshoot", "vintage", "solo"] };

  it("puts prompts sharing more tags first, even when they are older", () => {
    const rows = [
      prompt("new-one-tag", ["photoshoot"], "2026-06-01T00:00:00Z"),
      prompt("old-two-tags", ["photoshoot", "solo"], "2026-01-01T00:00:00Z"),
    ];

    expect(ids(rankRelatedPrompts(current, rows, 6))).toEqual(["old-two-tags", "new-one-tag"]);
  });

  it("counts a rare shared tag for more than a common one", () => {
    const rows = [
      prompt("common", ["photoshoot"], "2026-06-01T00:00:00Z"),
      prompt("a", ["photoshoot"]),
      prompt("b", ["photoshoot"]),
      prompt("rare", ["vintage"], "2026-01-01T00:00:00Z"),
    ];

    expect(ids(rankRelatedPrompts(current, rows, 1))).toEqual(["rare"]);
  });

  it("breaks ties with the newest", () => {
    const rows = [
      prompt("older", ["vintage"], "2026-01-01T00:00:00Z"),
      prompt("newer", ["vintage"], "2026-06-01T00:00:00Z"),
    ];

    expect(ids(rankRelatedPrompts(current, rows, 6))).toEqual(["newer", "older"]);
  });

  it("leaves out the prompt itself and anything sharing no tags, and respects the limit", () => {
    const rows = [
      prompt("current", ["photoshoot"]),
      prompt("unrelated", ["anime"]),
      prompt("a", ["solo"]),
      prompt("b", ["solo"]),
    ];

    expect(ids(rankRelatedPrompts(current, rows, 1))).toHaveLength(1);
    expect(ids(rankRelatedPrompts(current, rows, 6)).sort()).toEqual(["a", "b"]);
  });

  it("gives different prompts different suggestions when a popular tag is shared by all", () => {
    const rows = [
      prompt("x", ["photoshoot", "doodle"]),
      prompt("y", ["photoshoot", "anime"]),
      prompt("z", ["photoshoot"], "2026-06-01T00:00:00Z"),
    ];

    const forDoodle = rankRelatedPrompts({ id: "d", tags: ["photoshoot", "doodle"] }, rows, 1);
    const forAnime = rankRelatedPrompts({ id: "e", tags: ["photoshoot", "anime"] }, rows, 1);

    expect(ids(forDoodle)).toEqual(["x"]);
    expect(ids(forAnime)).toEqual(["y"]);
  });
});
