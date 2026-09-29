import { describe, it, expect, vi, beforeEach } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { deleteAccount } from "./account";
import { supabase } from "./client";

vi.mock("./client", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
  },
}));

describe("deleteAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("calls the delete-account function with POST", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: null, error: null } as never);

    const { error } = await deleteAccount();

    expect(supabase.functions.invoke).toHaveBeenCalledWith("delete-account", { method: "POST" });
    expect(error).toBeNull();
  });

  it("passes on the function's own error message", async () => {
    const response = new Response(
      JSON.stringify({ error: "Could not delete your files. Nothing was deleted, try again." }),
      { status: 500 }
    );
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(response),
    } as never);

    const { error } = await deleteAccount();

    expect(error).toBe("Could not delete your files. Nothing was deleted, try again.");
  });

  it("falls back to a generic message when there is no readable error", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new Error("Failed to fetch"),
    } as never);

    const { error } = await deleteAccount();

    expect(error).toBe("Couldn't delete your account. Please try again.");
  });
});
