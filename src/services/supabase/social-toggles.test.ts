import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "./client";
import { toggleLike } from "./likes";
import { toggleSave } from "./saves";
import { toggleFollow } from "./follows";

vi.mock("./client", () => ({ supabase: { from: vi.fn() } }));

describe.each([
  ["likes", toggleLike], ["saves", toggleSave], ["follows", toggleFollow],
] as const)("%s toggle", (table, toggle) => {
  const insert = vi.fn();
  const remove = vi.fn();
  const lookup = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    const builder = { select: () => builder, match: () => builder, maybeSingle: lookup, insert, delete: remove };
    vi.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>);
  });

  it("returns a failed lookup without attempting either write", async () => {
    const error = { message: "lookup unavailable", code: "503", details: "", hint: "" };
    lookup.mockResolvedValue({ data: null, error });
    expect(await toggle("viewer", "target")).toEqual({ error });
    expect(supabase.from).toHaveBeenCalledWith(table);
    expect(insert).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("inserts only after a successful absent lookup", async () => {
    lookup.mockResolvedValue({ data: null, error: null });
    insert.mockResolvedValue({ error: null });
    expect(await toggle("viewer", "target")).toEqual({ error: null });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes only after a successful existing lookup and returns write errors", async () => {
    const error = { message: "write unavailable", code: "503", details: "", hint: "" };
    lookup.mockResolvedValue({ data: { id: "existing" }, error: null });
    remove.mockReturnValue({ match: vi.fn().mockResolvedValue({ error }) });
    expect(await toggle("viewer", "target")).toEqual({ error });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
  });
});
