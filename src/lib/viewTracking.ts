/**
 * Prompt View Tracking & Deduplication
 *
 * Definition of a View:
 * A view represents an intentional viewing of a prompt detail page by a unique
 * visitor/session within a deduplication window (default: 30 minutes).
 *
 * Semantics & Deduplication Rules:
 * 1. Initial Visit: When a user or visitor opens a prompt detail page, 1 view is counted.
 * 2. Back-and-Forth Navigation & Tabs: Navigating away (e.g. back to feed/search), opening
 *    in new tabs, or returning to the same prompt within the 30-minute window does NOT inflate the view count.
 * 3. Remounts & Refetches: Component remounts, React StrictMode double mounts in dev,
 *    and query refetches do NOT trigger duplicate view counts.
 * 4. Distinct Prompts: Viewing different prompts records separate views for each prompt.
 * 5. Distinct Users / Devices: Two different visitors or devices viewing the prompt each count.
 * 6. Window Expiry: Returning to the prompt after the cooldown window expires counts as a new view.
 */

const STORAGE_KEY = "paro:viewed-prompts";
export const DEFAULT_VIEW_DEDUPE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

const memoryFallback = new Map<string, number>();

function getStoredViews(): Record<string, number> {
  const views: Record<string, number> = {};

  // First copy any existing memoryFallback entries
  for (const [id, timestamp] of memoryFallback.entries()) {
    views[id] = timestamp;
  }

  // Merge with localStorage entries if available
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [id, timestamp] of Object.entries(parsed)) {
          if (typeof timestamp === "number") {
            views[id] = Math.max(views[id] ?? 0, timestamp);
          }
        }
      }
    }
  } catch {
    // Storage might be unavailable (e.g. disabled, security error); memory entries are already preserved
  }

  return views;
}

function saveStoredViews(views: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // Storage might be disabled (e.g., private mode quota); fallback keeps in-memory map
  }
  memoryFallback.clear();
  Object.entries(views).forEach(([id, time]) => memoryFallback.set(id, time));
}

/**
 * Checks whether a view should be recorded for the given prompt, and if so,
 * records it in the deduplication store.
 *
 * @param promptId - The UUID / ID of the prompt being viewed.
 * @param cooldownMs - Cooldown duration in milliseconds (default: 30 minutes).
 * @param now - Current timestamp in milliseconds (defaults to Date.now()).
 * @returns boolean - true if this is a new view to increment in the backend; false if deduplicated.
 */
export function recordViewIfEligible(
  promptId: string,
  cooldownMs: number = DEFAULT_VIEW_DEDUPE_WINDOW_MS,
  now: number = Date.now()
): boolean {
  if (!promptId) return false;

  const views = getStoredViews();
  const lastViewedAt = views[promptId];

  if (typeof lastViewedAt === "number" && now - lastViewedAt < cooldownMs) {
    return false;
  }

  // Prune expired entries from merged storage and memory to prevent unbounded storage growth
  const prunedViews: Record<string, number> = {};
  for (const [id, timestamp] of Object.entries(views)) {
    if (typeof timestamp === "number" && now - timestamp < cooldownMs) {
      prunedViews[id] = timestamp;
    }
  }

  prunedViews[promptId] = now;
  saveStoredViews(prunedViews);

  return true;
}

/**
 * Clears the view tracking history. Primarily used in testing and resets.
 */
export function clearViewTracking() {
  memoryFallback.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
