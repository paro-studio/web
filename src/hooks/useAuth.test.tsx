import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./useAuth";

type AuthListener = (event: string, session: unknown) => void;
let listener: AuthListener | null = null;

vi.mock("@/services/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: AuthListener) => {
        listener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: async () => ({ data: { session: null } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

let signOut: () => Promise<void> = async () => {};
function CaptureSignOut() {
  signOut = useAuth().signOut;
  return <span>ready</span>;
}

function renderWithCache() {
  const client = new QueryClient();
  // Stand-ins for the previous user's cached, private data.
  client.setQueryData(["saved-prompts", "user-a"], [{ id: "p1" }]);
  client.setQueryData(["liked-prompts", "user-a"], [{ id: "p2" }]);
  render(
    <QueryClientProvider client={client}>
      <AuthProvider><CaptureSignOut /></AuthProvider>
    </QueryClientProvider>,
  );
  return client;
}

describe("AuthProvider sign out", () => {
  beforeEach(() => {
    listener = null;
  });

  it("clears cached queries when the Sign out button is used", async () => {
    const client = renderWithCache();
    await screen.findByText("ready");

    await act(() => signOut());

    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it("clears cached queries when Supabase reports SIGNED_OUT from elsewhere", async () => {
    const client = renderWithCache();
    await waitFor(() => expect(listener).not.toBeNull());

    // Another tab signing out, or the session expiring.
    act(() => listener!("SIGNED_OUT", null));

    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it("keeps the cache for other auth events", async () => {
    const client = renderWithCache();
    await waitFor(() => expect(listener).not.toBeNull());

    act(() => listener!("TOKEN_REFRESHED", { user: { id: "user-a" } }));

    expect(client.getQueryData(["saved-prompts", "user-a"])).toEqual([{ id: "p1" }]);
  });
});
