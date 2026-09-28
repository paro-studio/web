import { act, cleanup, renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCopyRatingInvitation } from "./useCopyRatingInvitation";
import { getUserPromptRating } from "@/services/supabase/ratings";

vi.mock("@/services/supabase/ratings", () => ({ getUserPromptRating: vi.fn() }));
let nextId = 0;
describe("copy rating invitation", () => {
  beforeEach(() => { vi.mocked(getUserPromptRating).mockReset().mockResolvedValue(null); localStorage.clear(); });
  afterEach(cleanup);

  it("waits for a successful copy notification, dismisses, and stays dismissed after remount", async () => {
    const id = `prompt-${nextId++}`;
    const first = renderHook(() => useCopyRatingInvitation(id, "viewer"));
    expect(first.result.current.visible).toBe(false);
    expect(getUserPromptRating).not.toHaveBeenCalled();
    await act(async () => { await first.result.current.afterCopy(); });
    expect(first.result.current.visible).toBe(true);
    act(() => first.result.current.dismiss());
    await act(async () => { await first.result.current.afterCopy(); });
    expect(first.result.current.visible).toBe(false);
    first.unmount();
    const second = renderHook(() => useCopyRatingInvitation(id, "viewer"));
    await act(async () => { await second.result.current.afterCopy(); });
    expect(second.result.current.visible).toBe(false);
    expect(getUserPromptRating).toHaveBeenCalledTimes(1);
  });

  it("does not invite someone who already rated", async () => {
    vi.mocked(getUserPromptRating).mockResolvedValue(4);
    const id = `prompt-${nextId++}`;
    const { result } = renderHook(() => useCopyRatingInvitation(id, "viewer"));
    await act(async () => { await result.current.afterCopy(); });
    expect(result.current.visible).toBe(false);
    expect(getUserPromptRating).toHaveBeenCalledWith("viewer", id, { throwOnError: true });
  });

  it("does not treat a failed lookup as an unrated prompt and allows a later attempt", async () => {
    vi.mocked(getUserPromptRating).mockRejectedValueOnce(new Error("offline"));
    const id = `prompt-${nextId++}`;
    const { result } = renderHook(() => useCopyRatingInvitation(id, "viewer"));
    await act(async () => { await result.current.afterCopy(); });
    expect(result.current.visible).toBe(false);
    await act(async () => { await result.current.afterCopy(); });
    expect(result.current.visible).toBe(true);
  });

  it("ignores a late lookup after the viewer changes", async () => {
    let resolve!: (rating: number | null) => void;
    vi.mocked(getUserPromptRating).mockReturnValue(new Promise(done => { resolve = done; }));
    const id = `prompt-${nextId++}`;
    const { result, rerender } = renderHook(({ viewer }) => useCopyRatingInvitation(id, viewer), { initialProps: { viewer: "first" } });
    let request!: Promise<void>;
    act(() => { request = result.current.afterCopy(); });
    rerender({ viewer: "second" });
    await act(async () => { resolve(null); await request; });
    expect(result.current.visible).toBe(false);
    expect(localStorage.getItem(`paro:rating-invitation:first:${id}`)).toBeNull();
  });

  it("ignores a pending lookup after leaving and returning to the same prompt", async () => {
    let resolve!: (rating: number | null) => void;
    vi.mocked(getUserPromptRating).mockReturnValue(new Promise(done => { resolve = done; }));
    const firstId = `prompt-${nextId++}`;
    const secondId = `prompt-${nextId++}`;
    const { result, rerender } = renderHook(
      ({ prompt }) => useCopyRatingInvitation(prompt, "viewer"),
      { initialProps: { prompt: firstId } },
    );
    let request!: Promise<void>;
    act(() => { request = result.current.afterCopy(); });
    rerender({ prompt: secondId });
    rerender({ prompt: firstId });
    await act(async () => { resolve(null); await request; });
    expect(result.current.visible).toBe(false);
    expect(localStorage.getItem(`paro:rating-invitation:viewer:${firstId}`)).toBeNull();
  });

  it("invalidates a lookup when identity changes before passive effects", async () => {
    let resolve!: (rating: number | null) => void;
    vi.mocked(getUserPromptRating)
      .mockReturnValueOnce(new Promise(done => { resolve = done; }))
      .mockResolvedValue(null);
    const firstId = `prompt-${nextId++}`;
    const secondId = `prompt-${nextId++}`;
    const { result, rerender } = renderHook(
      ({ prompt, resolveInLayout }) => {
        const invitation = useCopyRatingInvitation(prompt, "viewer");
        useLayoutEffect(() => {
          if (resolveInLayout) resolve(null);
        }, [resolveInLayout]);
        return invitation;
      },
      { initialProps: { prompt: firstId, resolveInLayout: false } },
    );
    let firstRequest!: Promise<void>;
    act(() => { firstRequest = result.current.afterCopy(); });
    rerender({ prompt: secondId, resolveInLayout: true });
    await act(async () => { await firstRequest; });
    expect(localStorage.getItem(`paro:rating-invitation:viewer:${firstId}`)).toBeNull();

    rerender({ prompt: firstId, resolveInLayout: false });
    await act(async () => { await result.current.afterCopy(); });
    expect(result.current.visible).toBe(true);
    expect(getUserPromptRating).toHaveBeenCalledTimes(2);
  });

  it("deduplicates simultaneous copies across two views", async () => {
    let resolve!: (rating: number | null) => void;
    vi.mocked(getUserPromptRating).mockReturnValue(new Promise(done => { resolve = done; }));
    const id = `prompt-${nextId++}`;
    const a = renderHook(() => useCopyRatingInvitation(id, "viewer"));
    const b = renderHook(() => useCopyRatingInvitation(id, "viewer"));
    await act(async () => {
      const first = a.result.current.afterCopy();
      const second = b.result.current.afterCopy();
      resolve(null); await Promise.all([first, second]);
    });
    expect(getUserPromptRating).toHaveBeenCalledTimes(1);
    expect(a.result.current.visible).toBe(true);
    expect(b.result.current.visible).toBe(false);
  });

  it("lets a later view use a lookup started by an unmounted view", async () => {
    let resolve!: (rating: number | null) => void;
    vi.mocked(getUserPromptRating).mockReturnValue(new Promise(done => { resolve = done; }));
    const id = `prompt-${nextId++}`;
    const card = renderHook(() => useCopyRatingInvitation(id, "viewer"));
    let cardRequest!: Promise<void>;
    act(() => { cardRequest = card.result.current.afterCopy(); });
    card.unmount();
    const detail = renderHook(() => useCopyRatingInvitation(id, "viewer"));
    let detailRequest!: Promise<void>;
    act(() => { detailRequest = detail.result.current.afterCopy(); });
    await act(async () => { resolve(null); await Promise.all([cardRequest, detailRequest]); });
    expect(getUserPromptRating).toHaveBeenCalledTimes(1);
    expect(detail.result.current.visible).toBe(true);
  });

  it("honors a persisted invitation from an earlier page load", async () => {
    const id = `prompt-${nextId++}`;
    localStorage.setItem(`paro:rating-invitation:viewer:${id}`, "1");
    const { result } = renderHook(() => useCopyRatingInvitation(id, "viewer"));
    await act(async () => { await result.current.afterCopy(); });
    expect(result.current.visible).toBe(false);
    expect(getUserPromptRating).not.toHaveBeenCalled();
  });

  it("does not reopen after rating dismisses an invitation whose lookup is still pending", async () => {
    let resolve!: (rating: number | null) => void;
    vi.mocked(getUserPromptRating).mockReturnValue(new Promise(done => { resolve = done; }));
    const id = `prompt-${nextId++}`;
    const { result } = renderHook(() => useCopyRatingInvitation(id, "viewer"));
    let request!: Promise<void>;
    act(() => { request = result.current.afterCopy(); });
    act(() => result.current.dismiss());
    await act(async () => { resolve(null); await request; });
    expect(result.current.visible).toBe(false);
  });
});
