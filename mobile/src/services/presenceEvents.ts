// Fan-out for the single presence socket (owned by RootNavigator), mirroring the web's
// subscribeToPresenceEvents (frontend/src/layout/Layout.jsx). Screens subscribe here instead
// of opening their own /ws/presence/ socket.

export type PresenceEvent =
  | { type: "initial_online_users"; user_ids?: number[]; userIds?: number[] }
  | { type: "presence_update"; user_id: number; is_online: boolean }
  | { type: "typing_status"; conversation_id: number; sender_id: number; is_typing: boolean }
  | { type: "conversation_update"; conversation_id?: number; trigger?: string; actor_id?: number };

export type PresenceEventHandler = (event: PresenceEvent) => void;

const handlers = new Set<PresenceEventHandler>();
// Online contacts as last reported by the socket (null until the first initial_online_users),
// so a screen that subscribes after the socket connected still gets the current list.
let onlineUserIds: Set<number> | null = null;

function trackOnlineUsers(event: PresenceEvent) {
  if (event.type === "initial_online_users") {
    onlineUserIds = new Set(event.user_ids || event.userIds || []);
  } else if (event.type === "presence_update" && onlineUserIds) {
    if (event.is_online) onlineUserIds.add(event.user_id);
    else onlineUserIds.delete(event.user_id);
  }
}

/** Called by the presence socket owner for every parsed frame. */
export function publishPresenceEvent(event: PresenceEvent) {
  if (!event || typeof event !== "object" || !event.type) return;
  trackOnlineUsers(event);
  handlers.forEach((handler) => {
    try {
      handler(event);
    } catch {
      // One failing subscriber must not break the others.
    }
  });
}

/**
 * Subscribes to presence socket events; returns the unsubscribe function. If the online list is
 * already known it is replayed immediately as an `initial_online_users` event. Every reconnect
 * delivers a fresh `initial_online_users` from the server.
 */
export function subscribeToPresenceEvents(handler: PresenceEventHandler) {
  handlers.add(handler);
  if (onlineUserIds) {
    handler({ type: "initial_online_users", user_ids: Array.from(onlineUserIds) });
  }
  return () => {
    handlers.delete(handler);
  };
}

/** Logout / socket owner teardown: forget the online list. */
export function resetPresenceEvents() {
  onlineUserIds = null;
}
