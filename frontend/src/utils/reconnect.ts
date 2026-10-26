// Shared websocket reconnect policy for the presence (Layout) and chat (ChatRoom) sockets.

// Close codes the backend uses to reject unauthenticated/unauthorised sockets.
export const SOCKET_AUTH_CLOSE_CODES = new Set([1008, 4401, 4403]);

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

/**
 * Exponential backoff with jitter: attempt 0 → 0.5–1 s, 1 → 1–2 s, 2 → 2–4 s, …, capped
 * at 15–30 s. The jitter spreads reconnects out when the backend comes back after an outage.
 */
export const getReconnectDelayMs = (attempt: number, random: () => number = Math.random) => {
  const safeAttempt = Math.max(0, Math.min(Number(attempt) || 0, 30));
  const ceiling = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** safeAttempt);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
};

export const isDocumentHidden = () =>
  typeof document !== "undefined" && document.visibilityState === "hidden";
