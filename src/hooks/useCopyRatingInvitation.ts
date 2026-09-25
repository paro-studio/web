import { useLayoutEffect, useRef, useState } from "react";
import { getUserPromptRating } from "@/services/supabase/ratings";

const shown = new Set<string>();
const pending = new Map<string, Promise<number | null>>();

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
  const key = promptId && userId ? `paro:rating-invitation:${userId}:${promptId}` : null;
  const activeKey = useRef(key);
  const keyRevision = useRef(0);
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  useLayoutEffect(() => {
    keyRevision.current += 1;
    activeKey.current = key;
    setVisibleKey(null);
    return () => { activeKey.current = null; };
  }, [key]);

  const afterCopy = async () => {
    if (!key || !promptId || !userId || wasShown(key)) return;
    const requestRevision = keyRevision.current;
    let lookup = pending.get(key);
    if (!lookup) {
      lookup = getUserPromptRating(userId, promptId, { throwOnError: true });
      pending.set(key, lookup);
    }
    try {
      // An unavailable lookup is not evidence that someone has never rated.
      const rating = await lookup;
      if (keyRevision.current !== requestRevision || activeKey.current !== key || wasShown(key)) return;
      remember(key);
      if (rating === null) setVisibleKey(key);
    } catch {
      // Copy succeeded; a failed optional invitation must not interrupt it.
    } finally {
      if (pending.get(key) === lookup) pending.delete(key);
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
