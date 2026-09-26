import { getPromptText } from "@/services/supabase/prompts";

/**
 * Fetches a prompt's text and copies it to the clipboard. Returns false if it
 * could not.
 *
 * The text is never loaded with the feed or the prompt page, only here, when a
 * signed in user taps Copy. That keeps it out of the network tab until someone
 * actually copies.
 *
 * Safari only allows a clipboard write during the tap, and a network wait ends
 * the tap. A ClipboardItem built from a promise gets around that: the write is
 * started straight away, inside the tap, and the browser waits for the text.
 * So nothing may be awaited before `clipboard.write` below. Browsers without
 * ClipboardItem fall back to fetching first and then writeText, which works
 * everywhere except old Safari.
 */
export async function copyPromptText(promptId: string): Promise<boolean> {
  const text = getPromptText(promptId).then(({ text }) => {
    if (!text) throw new Error("Prompt text unavailable");
    return text;
  });

  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      const blob = text.then(t => new Blob([t], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
    } else {
      await navigator.clipboard.writeText(await text);
    }
    return true;
  } catch (error) {
    console.error("Copy prompt failed:", error);
    return false;
  }
}
