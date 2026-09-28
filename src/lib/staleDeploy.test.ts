import { describe, it, expect, vi, beforeEach } from "vitest";
import { listenForStaleDeploys, reloadOnceForStaleDeploy } from "./staleDeploy";

describe("reloadOnceForStaleDeploy", () => {
  const reload = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    reload.mockReset();
    sessionStorage.clear();
    Object.defineProperty(window, "location", { value: { reload }, configurable: true });
  });

  it("reloads the first time", () => {
    expect(reloadOnceForStaleDeploy(100_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload again straight away, so a broken file cannot loop", () => {
    reloadOnceForStaleDeploy(100_000);
    expect(reloadOnceForStaleDeploy(105_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads again after a later deploy", () => {
    reloadOnceForStaleDeploy(100_000);
    expect(reloadOnceForStaleDeploy(200_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload when session storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(reloadOnceForStaleDeploy(100_000)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("stops Vite rethrowing only when it reloads", () => {
    listenForStaleDeploys();

    const first = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);

    const second = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
  });
});
