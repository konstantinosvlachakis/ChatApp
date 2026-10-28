// Pure message-list helpers used by ConversationsScreen (moved from the screen unchanged).

import type { ChatMessage } from "../../types";

// Broadcast payloads carry no current_user_reaction; derive it from `reactions`.
export function withCurrentUserReaction(message: ChatMessage, currentUserId?: number): ChatMessage {
  if ("current_user_reaction" in message || !Array.isArray(message.reactions)) return message;
  const own = message.reactions.find((reaction) => reaction.user_id === currentUserId);
  return { ...message, current_user_reaction: own?.emoji ?? null };
}

export function mergeMessagesById(older: ChatMessage[], current: ChatMessage[]) {
  const knownIds = new Set(current.map((message) => message.id));
  return [...older.filter((message) => !knownIds.has(message.id)), ...current];
}

export function buildPinnedMessages(messages?: ChatMessage[] | null) {
  return [...(messages || [])]
    .filter((message) => Boolean(message?.is_pinned))
    .sort(
      (left, right) =>
        new Date(right.pinned_at || right.timestamp).getTime() -
        new Date(left.pinned_at || left.timestamp).getTime()
    );
}

export function findFirstUnreadMessageId(
  messages: ChatMessage[],
  unreadCount: number,
  currentUserId?: number
) {
  if (!currentUserId || unreadCount <= 0) return null;
  let remaining = unreadCount;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.sender?.id === currentUserId) continue;
    remaining -= 1;
    if (remaining <= 0) return message.id;
  }
  return null;
}

/** Incoming messages after `anchorMessageId` (used for the jump-to-latest badge). */
export function countIncomingAfter(
  messages: ChatMessage[],
  anchorMessageId: number | null,
  currentUserId?: number
) {
  if (anchorMessageId == null) return 0;
  const anchorIndex = messages.findIndex((message) => message.id === anchorMessageId);
  if (anchorIndex === -1) return 0;
  let count = 0;
  for (let index = anchorIndex + 1; index < messages.length; index += 1) {
    if (messages[index]?.sender?.id !== currentUserId) count += 1;
  }
  return count;
}

/** Per-chat bookkeeping for `trackFreshMessages` (kept in a ref by the screen). */
export type FreshMessageTracker = {
  conversationId: number | null;
  knownIds: Set<number>;
  newestTime: number;
  /** Message id -> time (ms) until which its row may play the entry animation. */
  freshUntil: Map<number, number>;
};

export function createFreshMessageTracker(): FreshMessageTracker {
  return { conversationId: null, knownIds: new Set(), newestTime: -Infinity, freshUntil: new Map() };
}

/**
 * Marks messages that arrived after the chat was opened (sent, optimistic or received live) as
 * "fresh" for `windowMs`, so only those rows animate in. The first list of a chat, older pages
 * (older than the newest known message) and refreshes of known ids are never fresh.
 */
export function trackFreshMessages(
  tracker: FreshMessageTracker,
  conversationId: number | null,
  sortedMessages: ChatMessage[],
  now: number,
  windowMs = 1500
) {
  const timeOf = (message: ChatMessage) => new Date(message.timestamp).getTime() || 0;
  if (tracker.conversationId !== conversationId) {
    tracker.conversationId = conversationId;
    tracker.knownIds = new Set(sortedMessages.map((message) => message.id));
    tracker.freshUntil.clear();
    tracker.newestTime = sortedMessages.length ? timeOf(sortedMessages[sortedMessages.length - 1]) : -Infinity;
    return;
  }
  for (const message of sortedMessages) {
    if (tracker.knownIds.has(message.id)) continue;
    tracker.knownIds.add(message.id);
    const time = timeOf(message);
    if (time >= tracker.newestTime) tracker.freshUntil.set(message.id, now + windowMs);
  }
  if (sortedMessages.length) {
    tracker.newestTime = Math.max(tracker.newestTime, timeOf(sortedMessages[sortedMessages.length - 1]));
  }
}

export function isFreshMessage(tracker: FreshMessageTracker, messageId: number, now: number) {
  return (tracker.freshUntil.get(messageId) ?? 0) > now;
}
