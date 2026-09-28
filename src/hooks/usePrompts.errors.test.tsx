import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePrompts, useTopCreators } from "./usePrompts";
import { supabase } from "@/services/supabase/client";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/services/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/services/supabase/profiles", () => ({ getProfilesByIds: async () => new Map() }));
vi.mock("@/services/supabase/likes", () => ({ getLikeCounts: async () => new Map(), getLikedPromptIds: async () => new Set() }));
vi.mock("@/services/supabase/saves", () => ({ getSavedPromptIds: async () => new Set() }));
vi.mock("@/services/supabase/ratings", () => ({ getPromptRatings: async () => new Map() }));
vi.mock("@/services/supabase/follows", () => ({ getFollowerCounts: async () => new Map() }));

describe("query failure and recovery", () => {
  afterEach(cleanup);
  it.each([usePrompts, useTopCreators])("reports failure and recovers to a genuine empty result in %s", async (hook) => {
    let failed = true;
    const builder = {
      select: () => builder, order: () => builder, limit: () => builder,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(failed
        ? { data: null, error: { message: "private database detail", code: "503" } }
        : { data: [], error: null }).then(resolve),
    };
    vi.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => hook(), { wrapper });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.isError).toBe(true);
    expect(result.current.data).toBeUndefined();
    failed = false;
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    client.clear();
  });
});
