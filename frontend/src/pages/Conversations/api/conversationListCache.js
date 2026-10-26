// Helpers that patch the cached GET /api/conversations/ list in place so the chat screen
// doesn't refetch the whole list for every socket event. Each helper returns false when it
// could not patch safely (list not cached, conversation missing); callers then fall back
// to invalidating the query. Server-pushed `conversation_update` events still invalidate,
// so the cache converges on the server's view either way.

export const CONVERSATIONS_LIST_QUERY_KEY = ["conversationsList"];

const isSameId = (left, right) => left != null && right != null && String(left) === String(right);

const updateConversationInList = (queryClient, conversationId, updater, { moveToTop = false } = {}) => {
  const list = queryClient.getQueryData(CONVERSATIONS_LIST_QUERY_KEY);
  if (!Array.isArray(list)) return false;

  const index = list.findIndex((conversation) => isSameId(conversation?.id, conversationId));
  if (index === -1) return false;

  const current = list[index];
  const updated = updater(current);
  if (updated === current) return true;

  const next = moveToTop
    ? [updated, ...list.slice(0, index), ...list.slice(index + 1)]
    : list.map((conversation, position) => (position === index ? updated : conversation));
  queryClient.setQueryData(CONVERSATIONS_LIST_QUERY_KEY, next);
  return true;
};

/**
 * A new message was sent/received in `conversationId`: make it the last message and move the
 * conversation to the top (the list is ordered by most recent activity).
 * `markRead` resets the unread badge — used when the current user is viewing the chat and
 * the read receipt has been requested.
 */
export const applyNewMessageToConversationList = (
  queryClient,
  conversationId,
  message,
  { markRead = false } = {}
) => {
  if (!message?.id) return false;
  const timestamp = message.timestamp || new Date().toISOString();

  return updateConversationInList(
    queryClient,
    conversationId,
    (conversation) => ({
      ...conversation,
      last_message: { ...message, timestamp },
      updated_at: timestamp,
      unread_count: markRead ? 0 : conversation.unread_count,
    }),
    { moveToTop: true }
  );
};

/** The current user opened / read `conversationId`. */
export const markConversationReadInList = (queryClient, conversationId) =>
  updateConversationInList(queryClient, conversationId, (conversation) =>
    conversation.unread_count ? { ...conversation, unread_count: 0 } : conversation
  );

/** Delivery/read receipts: only the last message's status is shown in the list. */
export const applyMessageStatusToConversationList = (
  queryClient,
  conversationId,
  messageIds,
  status
) => {
  if (!Array.isArray(messageIds) || !status) return false;
  const ids = new Set(messageIds.map(String));

  return updateConversationInList(queryClient, conversationId, (conversation) => {
    const lastMessage = conversation.last_message;
    if (!lastMessage?.id || !ids.has(String(lastMessage.id)) || lastMessage.status === status) {
      return conversation;
    }
    return { ...conversation, last_message: { ...lastMessage, status } };
  });
};
