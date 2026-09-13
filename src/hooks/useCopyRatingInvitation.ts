import { useEffect, useRef, useState } from "react";
import { getUserPromptRating } from "@/services/supabase/ratings";

const shown = new Set<string>();
const pending = new Set<string>();

function wasShown(key: string) {
  if (shown.has(key)) return true;
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}

function remember(key: string) {
  shown.add(key);
  try { localStorage.setItem(key, "1"); } catch { /* Keep the in-memory fallback. */ }
}

/** Offer rating once per browser/viewer/prompt, only after a successful copy. */
export function useCopyRatingInvitation(promptId: string | undefined, userId: string | undefined) {
  const key = promptId ? `paro:rating-invitation:${userId ?? "guest"}:${promptId}` : null;
  const activeKey = useRef(key);
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  useEffect(() => {
    activeKey.current = key;
    return () => { activeKey.current = null; };
  }, [key]);

  const afterCopy = async () => {
    if (!key || !promptId || wasShown(key) || pending.has(key)) return;
    pending.add(key);
    try {
      // An unavailable lookup is not evidence that someone has never rated.
      const rating = userId ? await getUserPromptRating(userId, promptId, { throwOnError: true }) : null;
      if (activeKey.current !== key || wasShown(key)) return;
      remember(key);
      if (rating === null) setVisibleKey(key);
    } catch {
      // Copy succeeded; a failed optional invitation must not interrupt it.
    } finally {
      pending.delete(key);
    }
  };

  return {
    visible: key !== null && visibleKey === key,
    afterCopy,
    dismiss: () => {
      if (key) remember(key);
      setVisibleKey(null);
    },
  };
}
