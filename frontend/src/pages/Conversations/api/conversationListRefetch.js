// Decides when the cached GET /api/conversations/ list needs a refetch. That GET is not
// cheap: it is unpaginated and it marks incoming messages delivered (which broadcasts
// `message_status`), so socket events patch the cache where the client already knows the
// change and only fall back to a (debounced) refetch when it doesn't.

import {
  CONVERSATIONS_LIST_QUERY_KEY,
  markConversationReadInList,
  markOwnMessagesReadInList,
} from "./conversationListCache";

// Bursts of `conversation_update` events (send + read receipt, several messages) coalesce
// into one trailing refetch.
export const CONVERSATION_LIST_REFETCH_DEBOUNCE_MS = 2000;
// A tab hidden for longer than this may have missed socket events; refetch when shown.
export const CONVERSATION_LIST_STALE_AFTER_HIDDEN_MS = 60 * 1000;

// Triggers whose chat-room counterpart (`message_created`, `message_edited`,
// `message_deleted`, `message_pinned`) ChatRoom applies to the list itself while that
// conversation is open: it patches the list for new messages and invalidates it otherwise.
const OPEN_CHAT_HANDLED_TRIGGERS = new Set([
  "message_created",
  "message_updated",
  "message_deleted",
  "message_pinned",
  "message_unpinned",
]);

const isSameId = (left, right) => left != null && right != null && String(left) === String(right);

/**
 * How a presence `conversation_update` ({conversation_id, trigger, actor_id}) is handled:
 * - "ignore": not a conversation_update.
 * - "self_read": I read the conversation (this or another tab) → unread_count = 0.
 * - "partner_read": the other participant read it → my last message shows as read.
 * - "open_chat": the open ChatRoom applies this change from its own socket.
 * - "refetch": the payload doesn't say what changed (new message elsewhere, edit/delete/pin
 *   in a closed chat, unknown trigger) → refetch the list.
 */
export const resolveConversationUpdate = (event, { currentUserId, activeConversationId } = {}) => {
  if (event?.type !== "conversation_update") return "ignore";
  if (event.conversation_id == null) return "refetch";

  if (event.trigger === "messages_read" && currentUserId != null && event.actor_id != null) {
    return isSameId(event.actor_id, currentUserId) ? "self_read" : "partner_read";
  }
  if (
    OPEN_CHAT_HANDLED_TRIGGERS.has(event.trigger) &&
    isSameId(event.conversation_id, activeConversationId)
  ) {
    return "open_chat";
  }
  return "refetch";
};

/**
 * `patched` is whether the local cache could absorb the event (the conversation is in the
 * cached list). A conversation that isn't listed yet (e.g. a brand-new one) always refetches.
 */
export const shouldRefetchConversationList = (resolution, patched) => {
  if (resolution === "ignore") return false;
  if (resolution === "refetch") return true;
  return !patched;
};

const isConversationCached = (queryClient, conversationId) => {
  const list = queryClient.getQueryData(CONVERSATIONS_LIST_QUERY_KEY);
  return Array.isArray(list) && list.some((conversation) => isSameId(conversation?.id, conversationId));
};

/** Applies what it can to the cache; returns true when the list still needs a refetch. */
export const applyConversationUpdateToList = (queryClient, event, context = {}) => {
  const resolution = resolveConversationUpdate(event, context);
  let patched = false;
  if (resolution === "self_read") {
    patched = markConversationReadInList(queryClient, event.conversation_id);
  } else if (resolution === "partner_read") {
    patched = markOwnMessagesReadInList(queryClient, event.conversation_id, context.currentUserId);
  } else if (resolution === "open_chat") {
    patched = isConversationCached(queryClient, event.conversation_id);
  }
  return shouldRefetchConversationList(resolution, patched);
};

/** Trailing debounce with `cancel` / `flush` (flush runs a pending call now). */
export const createTrailingDebounce = (callback, delayMs) => {
  let timer = null;
  const run = () => {
    timer = null;
    callback();
  };
  const debounced = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(run, delayMs);
  };
  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  debounced.flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    run();
  };
  debounced.isPending = () => timer !== null;
  return debounced;
};

/**
 * On focus / tab shown: refetch only if events may have been missed — a `conversation_update`
 * arrived while no list was listening, or the tab was hidden long enough that sockets may
 * have dropped events. (Presence socket reconnects refetch on their own.)
 */
export const shouldRefetchListOnFocus = ({ missedUpdate = false, hiddenAt = null, now = Date.now() } = {}) =>
  Boolean(missedUpdate) ||
  (hiddenAt != null && now - hiddenAt > CONVERSATION_LIST_STALE_AFTER_HIDDEN_MS);
