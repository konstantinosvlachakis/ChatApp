// Shared websocket reconnect policy for the presence (Layout) and chat (ChatRoom) sockets.

// Close codes the backend uses to reject unauthenticated/unauthorised sockets.
export const SOCKET_AUTH_CLOSE_CODES = new Set([1008, 4401, 4403]);
// The backend closes with 4429 when the user has too many sockets open or a socket
// floods frames, so jump straight to the long end of the backoff instead of retrying
// within a second.
export const SOCKET_RATE_LIMIT_CLOSE_CODE = 4429;
export const RATE_LIMITED_RECONNECT_ATTEMPT = 5;
// A rejected socket is accepted first and then closed with its code (4401/4403/4429)
// within a second, so `onopen` alone does not mean the connection is good. Only after a
// socket has stayed open this long do we reset the backoff and the one-refresh-per-
// rejection guard; resetting them in `onopen` let open -> 4401/4403 -> refresh ->
// reconnect loop until /api/token/refresh/ was throttled (429).
export const SOCKET_STABLE_MS = 5000;

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

/**
 * Close a socket we no longer need. One that is still connecting (e.g. React StrictMode's
 * dev double-mount, or leaving a chat right after opening it) is closed once it opens,
 * which avoids the browser's "WebSocket is closed before the connection is established"
 * warning. Callers' onclose handlers still run and ignore the disposed socket.
 */
export const closeSocketQuietly = (socket?: WebSocket | null) => {
  if (!socket) return;
  socket.onmessage = null;
  socket.onerror = null;
  if (socket.readyState === WebSocket.CONNECTING) {
    socket.onopen = () => socket.close();
  } else if (socket.readyState === WebSocket.OPEN) {
    socket.close();
  }
};

export const isDocumentHidden = () =>
  typeof document !== "undefined" && document.visibilityState === "hidden";
