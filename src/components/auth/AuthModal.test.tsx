import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/hooks/useAuth";
import { AuthModal } from "./AuthModal";
import { peekPendingRoute, setPendingRoute } from "@/lib/pendingRoute";

const oauth = vi.fn();
const toast = vi.fn();
vi.mock("@/services/supabase/client", () => ({
  supabase: { auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    getSession: async () => ({ data: { session: null } }),
    signInWithOAuth: (...args: unknown[]) => oauth(...args),
  } },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

async function show(mode: "login" | "signup" = "login") {
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider><AuthModal open onOpenChange={onOpenChange} defaultMode={mode} /></AuthProvider>
    </QueryClientProvider>
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled());
  return onOpenChange;
}

describe("Google-only authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    oauth.mockResolvedValue({ data: {}, error: null });
  });

  it.each(["login", "signup"] as const)("offers only working authentication in %s mode", async mode => {
    await show(mode);
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByText("Or continue with email")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create account|^sign in$|sign up/i })).not.toBeInTheDocument();
  });

  it("starts Google OAuth with the existing return URL and preserves the pending route", async () => {
    setPendingRoute("/prompt/example");
    const onOpenChange = await show();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(oauth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    }));
    expect(peekPendingRoute()).toBe("/prompt/example");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it.each([false, true])("allows retry after an OAuth failure (throws: %s)", async throws => {
    const error = new Error("OAuth unavailable");
    if (throws) oauth.mockRejectedValueOnce(error);
    else oauth.mockResolvedValueOnce({ data: null, error });
    await show();
    const button = screen.getByRole("button", { name: "Continue with Google" });
    fireEvent.click(button);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Sign in failed" })));
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(oauth).toHaveBeenCalledTimes(2));
    expect(button).toBeDisabled();
  });
});
