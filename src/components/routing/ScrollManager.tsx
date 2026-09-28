import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const STORAGE_KEY = "paro-scroll-positions";
// Long enough for a cached feed to lay out, short enough that a restore never
// yanks the page after the user has started reading.
const RESTORE_TIMEOUT_MS = 2000;

function readPositions(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writePosition(key: string, y: number) {
  try {
    const positions = readPositions();
    positions[key] = y;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Storage can be unavailable (private mode, quota). Scrolling still works,
    // it just won't be restored.
  }
}

// index.css sets `scroll-behavior: smooth`, which would otherwise animate these
// jumps: a visible glide to the top on every page change, and a slide down the
// feed when going back.
function scrollInstantly(top: number) {
  window.scrollTo({ top, left: 0, behavior: "instant" });
}

/**
 * Scroll handling for the whole app.
 *
 * New pages start at the top, so opening a prompt from halfway down the feed
 * doesn't land halfway down the prompt.
 *
 * Back and forward restore where you were. The browser can't do this on its
 * own here: it restores while the previous page is still on screen, so the
 * position gets capped at that page's height. Opening a prompt from 3000px
 * down the feed and pressing back used to land at 0 to 1100px. So restoration
 * is manual: positions are saved per history entry, and put back once the page
 * has rendered, retrying briefly until the page is tall enough.
 *
 * Tag and search changes on the feed replace the history entry without
 * changing the path. Those keep their position rather than jumping to the top.
 */
export function ScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const currentKey = useRef(location.key);
  const currentPath = useRef(location.pathname);
  const restoring = useRef(false);

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  // Save the position of whichever entry is showing, as the user scrolls.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (restoring.current || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        writePosition(currentKey.current, Math.round(window.scrollY));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  useLayoutEffect(() => {
    const samePath = currentPath.current === location.pathname;
    currentKey.current = location.key;
    currentPath.current = location.pathname;

    if (navigationType !== "POP") {
      restoring.current = false;
      if (samePath) {
        // Same page, new entry (tags, search): stay put, and record it under
        // the new entry so back returns here too.
        writePosition(location.key, Math.round(window.scrollY));
      } else {
        scrollInstantly(0);
      }
      return;
    }

    const target = readPositions()[location.key] ?? 0;
    restoring.current = true;

    let frame = 0;
    const started = performance.now();
    const stop = () => {
      restoring.current = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("mousedown", stop);
    };

    const attempt = () => {
      scrollInstantly(target);
      const reached = Math.abs(window.scrollY - target) <= 1;
      if (reached || performance.now() - started > RESTORE_TIMEOUT_MS) {
        stop();
        return;
      }
      frame = requestAnimationFrame(attempt);
    };

    // Any input from the user wins over the restore.
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("keydown", stop);
    window.addEventListener("mousedown", stop);

    attempt();
    return stop;
  }, [location.key, location.pathname, navigationType]);

  return null;
}
