/**
 * Reloads the page when a script from an older deploy is gone.
 *
 * Pages load their code on demand, from file names that change on every
 * deploy. Someone who opened the site before a deploy still has the old
 * names, so the first click to a page they had not loaded yet asks for a file
 * that no longer exists, and the page went white. A reload picks up the new
 * deploy and its new file names.
 *
 * Only one reload per 10 seconds, so a file that is genuinely broken cannot
 * put the page in a reload loop. If session storage is unavailable, it does
 * not reload at all, for the same reason.
 */
const KEY = "paro:stale-deploy-reload";
const WINDOW_MS = 10_000;

export function reloadOnceForStaleDeploy(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (now - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(now));
  } catch {
    return false;
  }

  window.location.reload();
  return true;
}

export function listenForStaleDeploys() {
  window.addEventListener("vite:preloadError", (event) => {
    // Stops Vite rethrowing, which would leave the white screen behind while
    // the reload starts.
    if (reloadOnceForStaleDeploy()) event.preventDefault();
  });
}
