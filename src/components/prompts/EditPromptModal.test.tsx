import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditPromptModal } from "./EditPromptModal";

const updatePrompt = vi.fn();
const uploadPromptImage = vi.fn();
const toast = vi.fn();
const deletePromptImage = vi.fn();
const onUpdated = vi.fn();
const onClose = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("@/services/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
  },
}));

vi.mock("@/services/supabase/prompts", () => ({
  updatePrompt: (...args: unknown[]) => updatePrompt(...args),
}));

vi.mock("@/services/supabase/storage", () => ({
  uploadPromptImage: (...args: unknown[]) => uploadPromptImage(...args),
  deletePromptImage: (...args: unknown[]) => deletePromptImage(...args),
}));

const prompt = {
  id: "prompt-1",
  title: "A cat in a spacesuit",
  prompt_text: "a cat wearing a spacesuit",
  image_url: "https://example.test/original.png",
  tool_used: "Midjourney",
  // Save stays disabled below three tags.
  tags: ["portrait", "cinematic", "aesthetic"],
};

function renderModal() {
  return render(
    <EditPromptModal
      isOpen
      onClose={onClose}
      onUpdated={onUpdated}
      prompt={prompt}
    />,
  );
}

/** Pick a new image, which is what makes the preview an object URL. */
function chooseImage() {
  const file = new File(["x"], "new.png", { type: "image/png" });
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
}

describe("EditPromptModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deletePromptImage.mockReset().mockResolvedValue({ error: null });
    updatePrompt.mockResolvedValue({ prompt: { id: "prompt-1" }, error: null });
    uploadPromptImage.mockResolvedValue({
      url: "https://storage.test/prompt-images/user-1/abc.png",
      error: null,
    });
    // jsdom does not implement object URLs.
    window.URL.createObjectURL = vi.fn(() => "blob:http://localhost/fake-blob");
  });

  it("uploads a newly picked image instead of saving the preview", async () => {
    renderModal();

    const file = chooseImage();
    save();

    await waitFor(() => expect(uploadPromptImage).toHaveBeenCalled());
    expect(uploadPromptImage).toHaveBeenCalledWith("user-1", file);

    const saved = updatePrompt.mock.calls[0]?.[2];
    expect(saved.image_url).toBe(
      "https://storage.test/prompt-images/user-1/abc.png",
    );
  });

  it("never writes a blob: URL to the database", async () => {
    // The original bug. The preview object URL only resolves in the tab that
    // created it, so persisting one leaves a permanently broken image.
    renderModal();

    chooseImage();
    save();

    await waitFor(() => expect(updatePrompt).toHaveBeenCalled());
    const saved = updatePrompt.mock.calls[0]?.[2];
    expect(saved.image_url).not.toMatch(/^blob:/);
  });

  it("does not save anything when the upload fails", async () => {
    uploadPromptImage.mockResolvedValue({ url: null, error: "File too large" });

    renderModal();

    chooseImage();
    save();

    await waitFor(() => expect(uploadPromptImage).toHaveBeenCalled());
    expect(updatePrompt).not.toHaveBeenCalled();
    expect(deletePromptImage).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });

  it("keeps the existing image when none was picked", async () => {
    renderModal();

    save();

    await waitFor(() => expect(updatePrompt).toHaveBeenCalled());
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(deletePromptImage).not.toHaveBeenCalled();
    expect(uploadPromptImage).not.toHaveBeenCalled();
    expect(updatePrompt.mock.calls[0]?.[2].image_url).toBe(
      "https://example.test/original.png",
    );
  });

  it("removes the old image only after the row update succeeds", async () => {
    let finishUpdate!: (value: unknown) => void;
    updatePrompt.mockImplementationOnce(() => new Promise(resolve => { finishUpdate = resolve; }));
    renderModal();
    chooseImage();
    save();
    await waitFor(() => expect(updatePrompt).toHaveBeenCalled());
    expect(deletePromptImage).not.toHaveBeenCalled();
    finishUpdate({ prompt: { id: "prompt-1" }, error: null });
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(deletePromptImage).toHaveBeenCalledExactlyOnceWith(prompt.image_url);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each([
    { prompt: null, error: "Database unavailable" },
    { prompt: null, error: null },
  ])("keeps the old image when the row is not updated: %j", async result => {
    updatePrompt.mockResolvedValueOnce(result);
    renderModal();
    chooseImage();
    save();
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Update failed" })));
    expect(deletePromptImage).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it.each(["returned", "thrown"])("still completes the edit when cleanup fails (%s)", async failure => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      if (failure === "returned") deletePromptImage.mockResolvedValueOnce({ error: "Storage unavailable" });
      else deletePromptImage.mockRejectedValueOnce(new Error("Storage unavailable"));
      renderModal();
      chooseImage();
      save();
      await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
      expect(deletePromptImage).toHaveBeenCalledExactlyOnceWith(prompt.image_url);
      expect(log).toHaveBeenCalled();
      expect(toast).toHaveBeenCalledExactlyOnceWith({ title: "Prompt updated successfully" });
      expect(onUpdated).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });

});
