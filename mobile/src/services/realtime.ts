// Shared websocket policy for the presence sockets (RootNavigator, ConversationsScreen).

// Same frame and interval as the web presence socket (frontend/src/layout/Layout.jsx).
// The backend only writes last_seen about once a minute, but without heartbeats a user
// counts as offline ~90 s after connecting.
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 20_000;
export const PRESENCE_HEARTBEAT_FRAME = JSON.stringify({ type: "heartbeat" });

// Close codes the backend uses to reject unauthenticated/unauthorised sockets.
export const SOCKET_AUTH_CLOSE_CODES = new Set([1008, 4401, 4403]);

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30_000;

/** Exponential backoff with jitter: 0.5–1 s, 1–2 s, 2–4 s, … capped at 15–30 s. */
export function getReconnectDelayMs(attempt: number, random: () => number = Math.random) {
  const safeAttempt = Math.max(0, Math.min(Number(attempt) || 0, 30));
  const ceiling = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** safeAttempt);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

/** Sends presence heartbeats while the socket is open; returns a stop function. */
export function startPresenceHeartbeat(socket: WebSocket) {
  const timer = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(PRESENCE_HEARTBEAT_FRAME);
    }
  }, PRESENCE_HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(timer);
}
