import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useSocialMutation } from "./useSocialMutation";

const mocks = vi.hoisted(() => ({ like: vi.fn(), save: vi.fn(), follow: vi.fn(), toast: vi.fn() }));
vi.mock("@/services/supabase/likes", () => ({ toggleLike: mocks.like }));
vi.mock("@/services/supabase/saves", () => ({ toggleSave: mocks.save }));
vi.mock("@/services/supabase/follows", () => ({ toggleFollow: mocks.follow }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

function deferred() {
  let resolve!: (value: { error: Error | null }) => void;
  const promise = new Promise<{ error: Error | null }>(done => { resolve = done; });
  return { promise, resolve };
}

const row = { id: "p", isLiked: false, isSaved: false, likeCount: 4, title: "Keep this title" };
const keys = [
  ["prompts", [], "", "newest", 50, "viewer"], ["prompt", "p", "viewer"],
  ["recommendations", "other", ["tag"], "viewer"], ["profile-prompts", "creator", "viewer"],
  ["liked-prompts", "viewer"], ["saved-prompts", "viewer"],
];

function fixture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  for (const key of keys) client.setQueryData(key, key[0] === "prompt" ? row : [row, { ...row, id: "other" }]);
  client.setQueryData(["prompt", "p", "other-viewer"], row);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

describe("shared social mutations", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("shares pending values, ignores rapid duplicate toggles, and commits every current-viewer cache", async () => {
    const request = deferred();
    mocks.like.mockReturnValue(request.promise);
    const { client, wrapper } = fixture();
    const { result } = renderHook(() => ({
      card: useSocialMutation("like", "viewer", "p"),
      detail: useSocialMutation("like", "viewer", "p"),
    }), { wrapper });
    act(() => { result.current.card.toggle(false, 4); result.current.detail.toggle(false, 4); });
    await waitFor(() => expect(result.current.detail.pending).toEqual({ active: true, count: 5 }));
    expect(mocks.like).toHaveBeenCalledTimes(1);
    await act(async () => request.resolve({ error: null }));
    await waitFor(() => expect(result.current.card.isPending).toBe(false));
    for (const key of keys) {
      const data = client.getQueryData(key);
      const actual = Array.isArray(data) ? data[0] : data;
      expect(actual).toEqual({ ...row, isLiked: true, likeCount: 5 });
      if (Array.isArray(data)) expect(data[1]).toEqual({ ...row, id: "other" });
    }
    expect(client.getQueryData(["prompt", "p", "other-viewer"])).toEqual(row);
  });

  it("a failed like does not undo a simultaneous successful save", async () => {
    const like = deferred();
    mocks.like.mockReturnValue(like.promise);
    mocks.save.mockResolvedValue({ error: null });
    const { client, wrapper } = fixture();
    const { result } = renderHook(() => ({
      like: useSocialMutation("like", "viewer", "p"), save: useSocialMutation("save", "viewer", "p"),
    }), { wrapper });
    act(() => { result.current.like.toggle(false, 4); result.current.save.toggle(false); });
    await waitFor(() => expect(client.getQueryData(["prompt", "p", "viewer"])).toEqual({ ...row, isSaved: true }));
    await act(async () => like.resolve({ error: new Error("offline") }));
    await waitFor(() => expect(result.current.like.isPending).toBe(false));
    expect(client.getQueryData(["prompt", "p", "viewer"])).toEqual({ ...row, isSaved: true });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("removes an unsaved prompt from Saved without removing it from other lists", async () => {
    mocks.save.mockResolvedValue({ error: null });
    const { client, wrapper } = fixture();
    const { result } = renderHook(() => useSocialMutation("save", "viewer", "p"), { wrapper });
    act(() => result.current.toggle(true));
    await waitFor(() => expect(client.getQueryData(["saved-prompts", "viewer"])).toEqual([{ ...row, id: "other" }]));
    expect(client.getQueryData(keys[0])).toEqual([row, { ...row, id: "other" }]);
  });

  it("clears optimistic state after a thrown request error and allows retry", async () => {
    mocks.like.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ error: null });
    const { client, wrapper } = fixture();
    const { result } = renderHook(() => useSocialMutation("like", "viewer", "p"), { wrapper });
    act(() => result.current.toggle(false, 4));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(client.getQueryData(["prompt", "p", "viewer"])).toEqual(row);
    act(() => result.current.toggle(false, 4));
    await waitFor(() => expect(client.getQueryData(["prompt", "p", "viewer"])).toEqual({ ...row, isLiked: true, likeCount: 5 }));
    expect(mocks.like).toHaveBeenCalledTimes(2);
  });
});
