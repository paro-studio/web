import { describe, it, expect } from "vitest";
import { getErrorMessage, isMissingRowError } from "./errors";

describe("getErrorMessage", () => {
  it("unwraps a real Error", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("passes a thrown string straight through", () => {
    expect(getErrorMessage("just a string")).toBe("just a string");
  });

  it("reads Supabase-shaped { message } objects", () => {
    // This is the shape that actually matters — Supabase errors are plain
    // objects, not Error instances, so `instanceof Error` misses them.
    expect(getErrorMessage({ message: "row-level security violation" })).toBe(
      "row-level security violation",
    );
  });

  it("falls back when message is present but empty", () => {
    // An empty message would render as a blank toast, which reads as a bug.
    expect(getErrorMessage({ message: "" })).toBe("Unknown error");
  });

  it("falls back when message is not a string", () => {
    expect(getErrorMessage({ message: 500 })).toBe("Unknown error");
    expect(getErrorMessage({ message: null })).toBe("Unknown error");
  });

  it("falls back for values with no message at all", () => {
    expect(getErrorMessage(null)).toBe("Unknown error");
    expect(getErrorMessage(undefined)).toBe("Unknown error");
    expect(getErrorMessage(42)).toBe("Unknown error");
    expect(getErrorMessage({})).toBe("Unknown error");
  });

  it("uses a caller-supplied fallback", () => {
    expect(getErrorMessage(null, "Could not save prompt")).toBe(
      "Could not save prompt",
    );
  });

  it("prefers the real message over the fallback", () => {
    expect(getErrorMessage(new Error("boom"), "Could not save prompt")).toBe(
      "boom",
    );
  });

  it("subclasses of Error still resolve", () => {
    class StorageError extends Error {}
    expect(getErrorMessage(new StorageError("bucket missing"))).toBe(
      "bucket missing",
    );
  });
});

describe("isMissingRowError", () => {
  it.each(["PGRST116", "22P02"])("treats %s as a missing row", (code) => {
    expect(isMissingRowError({ code })).toBe(true);
  });

  it.each([{ code: "503" }, { code: undefined }, null, undefined])("does not treat %j as missing", (error) => {
    expect(isMissingRowError(error)).toBe(false);
  });
});
