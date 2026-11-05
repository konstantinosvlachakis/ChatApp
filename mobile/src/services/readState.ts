// Optimistic "read" state for conversations. Opening a chat clears its unread count on the tab
// badge and the list at once; the server catches up when PATCH /conversations/<id>/read/ lands.
// Until then (and for list fetches that started before it landed) a server count for that chat
// is treated as 0, so a slow or overlapping refresh can't bring the old badge back.

type ReadEntry = { confirmedAt: number | null };

const entries = new Map<number, ReadEntry>();
const listeners = new Set<(conversationId: number) => void>();

/** The user opened this chat: its unread messages count as read from now on. */
export function markReadLocally(conversationId: number) {
  entries.set(conversationId, { confirmedAt: null });
  listeners.forEach((listener) => listener(conversationId));
}

/** The server confirmed the read. */
export function confirmReadLocally(conversationId: number, at = Date.now()) {
  const entry = entries.get(conversationId);
  if (entry) entry.confirmedAt = at;
}

/** The read request failed: trust the server again. */
export function forgetReadLocally(conversationId: number) {
  entries.delete(conversationId);
}

/**
 * The unread count to show for a server count fetched by a request started at `fetchStartedAt`.
 * Once a fetch started after the server confirmed the read, the override is dropped.
 */
export function adjustUnreadCount(conversationId: number, serverCount: number, fetchStartedAt: number) {
  const entry = entries.get(conversationId);
  if (!entry) return serverCount;
  if (entry.confirmedAt === null || entry.confirmedAt >= fetchStartedAt) return 0;
  entries.delete(conversationId);
  return serverCount;
}

export function subscribeToLocalReads(listener: (conversationId: number) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetReadState() {
  entries.clear();
}
