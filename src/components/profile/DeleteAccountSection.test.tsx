import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeleteAccountSection } from "./DeleteAccountSection";
import { deleteAccount } from "@/services/supabase/account";

const signOut = vi.fn();
const toast = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ signOut }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("@/services/supabase/account", () => ({
  deleteAccount: vi.fn(),
}));

function renderSection() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route path="/settings" element={<DeleteAccountSection />} />
        <Route path="/" element={<p>Home page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
  return screen.getByRole("dialog");
}

describe("DeleteAccountSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOut.mockResolvedValue(undefined);
  });

  it("only enables the delete button once DELETE is typed", () => {
    renderSection();
    openDialog();

    const confirmButton = screen.getByRole("button", { name: "Delete my account" });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "delete" } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "DELETE" } });
    expect(confirmButton).toBeEnabled();
  });

  it("deletes the account, signs out and goes home", async () => {
    vi.mocked(deleteAccount).mockResolvedValue({ error: null });
    renderSection();
    openDialog();

    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(await screen.findByText("Home page")).toBeInTheDocument();
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Account deleted" }));
  });

  it("stays signed in and shows the error when deleting fails", async () => {
    vi.mocked(deleteAccount).mockResolvedValue({ error: "Could not delete your files. Try again." });
    renderSection();
    openDialog();

    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Could not delete your files. Try again.", variant: "destructive" })
      )
    );
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeEnabled();
  });

  it("clears the typed confirmation when cancelled", () => {
    renderSection();
    openDialog();

    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    openDialog();
    expect(screen.getByLabelText(/to confirm/)).toHaveValue("");
  });
});
