import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UploadPrompt from "./Upload";

const { toast, auth } = vi.hoisted(() => ({
  toast: vi.fn(),
  auth: { user: { id: "test-user" }, session: { user: { id: "test-user" } }, profile: { verified: true }, loading: false },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => auth,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/components/layout/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => null }));
vi.mock("@/services/supabase/client", () => ({ supabase: {} }));
vi.mock("@/services/supabase/prompts", () => ({
  checkDailyUploadLimit: vi.fn().mockResolvedValue({ canUpload: true, isVerified: true }),
}));

async function renderUpload() {
  const { container } = render(<MemoryRouter><UploadPrompt /></MemoryRouter>);
  await screen.findByText(/Verified Creator/);
  return container.querySelector<HTMLInputElement>('input[type="file"]')!;
}

describe("prompt image selection", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("limits the file picker to the storage-supported formats", async () => {
    const input = await renderUpload();
    expect(input.accept.split(",").sort()).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });

  it.each(["image/heic", "image/heif", "image/gif", "image/svg+xml", "text/plain", ""])(
    "rejects %s immediately without reading a preview",
    async type => {
      const input = await renderUpload();
      const read = vi.spyOn(FileReader.prototype, "readAsDataURL");
      fireEvent.change(input, { target: { files: [new File(["sample"], "photo", { type })] } });
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Invalid file type",
        description: "Please select a JPEG, PNG, or WebP image",
        variant: "destructive",
      }));
      expect(read).not.toHaveBeenCalled();
      expect(screen.queryByAltText("Preview")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Upload Prompt" })).toBeDisabled();
      fireEvent.submit(input.closest("form")!);
      await waitFor(() => expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Image required" })));
    }
  );

  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s and creates a preview", async type => {
    const input = await renderUpload();
    fireEvent.change(input, { target: { files: [new File(["sample"], "photo", { type })] } });
    await waitFor(() => expect(screen.getByAltText("Preview")).toHaveAttribute("src", expect.stringContaining(`data:${type};base64,`)));
    expect(toast).not.toHaveBeenCalled();
  });

  it("clears an earlier selection when the replacement is unsupported", async () => {
    const input = await renderUpload();
    fireEvent.change(input, { target: { files: [new File(["sample"], "photo.png", { type: "image/png" })] } });
    await screen.findByAltText("Preview");
    fireEvent.change(input, { target: { files: [new File(["sample"], "photo.heic", { type: "image/heic" })] } });
    expect(screen.queryByAltText("Preview")).not.toBeInTheDocument();
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Image required" })));
  });
});
