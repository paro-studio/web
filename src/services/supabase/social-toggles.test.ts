import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "./client";
import { setLike } from "./likes";
import { setSave } from "./saves";
import { setFollow } from "./follows";

vi.mock("./client", () => ({ supabase: { from: vi.fn() } }));

describe.each([
  ["likes", setLike, { user_id: "viewer", prompt_id: "target" }, "user_id,prompt_id"],
  ["saves", setSave, { user_id: "viewer", prompt_id: "target" }, "user_id,prompt_id"],
  ["follows", setFollow, { follower_id: "viewer", following_id: "target" }, "follower_id,following_id"],
] as const)("%s desired state", (table, setActive, row, onConflict) => {
  const upsert = vi.fn();
  const match = vi.fn();
  const remove = vi.fn(() => ({ match }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.from).mockReturnValue({ upsert, delete: remove } as unknown as ReturnType<typeof supabase.from>);
  });

  it("sets active with a duplicate-safe insert and no lookup", async () => {
    upsert.mockResolvedValue({ error: null });
    expect(await setActive("viewer", "target", true)).toEqual({ error: null });
    expect(supabase.from).toHaveBeenCalledWith(table);
    expect(upsert).toHaveBeenCalledWith(row, { onConflict, ignoreDuplicates: true });
    expect(remove).not.toHaveBeenCalled();
  });

  it("sets inactive with an idempotent delete", async () => {
    match.mockResolvedValue({ error: null });
    expect(await setActive("viewer", "target", false)).toEqual({ error: null });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(match).toHaveBeenCalledWith(row);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns write errors for either desired state", async () => {
    const error = { message: "write unavailable", code: "503", details: "", hint: "" };
    upsert.mockResolvedValueOnce({ error });
    match.mockResolvedValueOnce({ error });
    expect(await setActive("viewer", "target", true)).toEqual({ error });
    expect(await setActive("viewer", "target", false)).toEqual({ error });
  });
});
