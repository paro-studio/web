import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { copyPromptText } from "./copyPromptText";
import { getPromptText } from "@/services/supabase/prompts";

vi.mock("@/services/supabase/prompts", () => ({
  getPromptText: vi.fn(),
}));

describe("copyPromptText", () => {
  const writeText = vi.fn();
  const write = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    writeText.mockResolvedValue(undefined);
    vi.mocked(getPromptText).mockResolvedValue({ text: "fetched prompt", error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("with ClipboardItem", () => {
    // Resolves the item's blob, the way the browser does once the text arrives.
    beforeEach(() => {
      vi.stubGlobal("ClipboardItem", class {
        items: Record<string, Promise<Blob>>;
        constructor(items: Record<string, Promise<Blob>>) { this.items = items; }
      });
      write.mockImplementation(async ([item]) => { await item.items["text/plain"]; });
      Object.assign(navigator, { clipboard: { write, writeText } });
    });

    it("starts the write before the text has arrived", async () => {
      vi.mocked(getPromptText).mockReturnValue(new Promise(() => {}));

      void copyPromptText("p1");

      // Called synchronously, still inside the tap.
      expect(write).toHaveBeenCalledTimes(1);
      expect(getPromptText).toHaveBeenCalledWith("p1");
    });

    it("copies the fetched text", async () => {
      expect(await copyPromptText("p1")).toBe(true);
      const [item] = write.mock.calls[0][0];
      const blob: Blob = await item.items["text/plain"];
      // jsdom's Blob has no text(), so read it the older way.
      const copied = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsText(blob);
      });
      expect(copied).toBe("fetched prompt");
    });

    it("fails rather than copying nothing when the text is unavailable", async () => {
      vi.mocked(getPromptText).mockResolvedValue({ text: null, error: null });

      expect(await copyPromptText("p1")).toBe(false);
    });
  });

  describe("without ClipboardItem", () => {
    beforeEach(() => {
      vi.stubGlobal("ClipboardItem", undefined);
      Object.assign(navigator, { clipboard: { writeText } });
    });

    it("fetches, then writes the text", async () => {
      expect(await copyPromptText("p1")).toBe(true);
      expect(writeText).toHaveBeenCalledWith("fetched prompt");
    });

    it("never copies the word undefined when the text is unavailable", async () => {
      vi.mocked(getPromptText).mockResolvedValue({ text: null, error: null });

      expect(await copyPromptText("p1")).toBe(false);
      expect(writeText).not.toHaveBeenCalled();
    });

    it("reports failure when the browser refuses the clipboard write", async () => {
      writeText.mockRejectedValue(new Error("NotAllowedError"));

      expect(await copyPromptText("p1")).toBe(false);
    });
  });
});
