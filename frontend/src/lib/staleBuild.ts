// After a deploy, an open tab still runs the previous build and asks for chunk files
// that no longer exist. Reloading once fetches the new build; the guard stops a
// reload loop when the chunk is missing for another reason (offline, server error).

const RELOAD_KEY = "lv:stale-build-reload-at";
const RELOAD_GUARD_MS = 30_000;

export const isChunkLoadError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: string; message?: string };
  return name === "ChunkLoadError" || /Loading (CSS )?chunk [\w-]+ failed/i.test(message || "");
};

const readLastReload = (): number => {
  try {
    return Number(window.sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    return 0;
  }
};

/** Reload the page once to pick up a new build; returns false if it already tried recently. */
export const reloadForNewBuild = (now: number = Date.now()): boolean => {
  if (now - readLastReload() < RELOAD_GUARD_MS) return false;
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // Storage blocked (private mode): without the guard, still reload once per page view.
  }
  window.location.reload();
  return true;
};
