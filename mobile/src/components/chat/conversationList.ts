// Pure helpers for the Chats list and chat header (mirrors web `utils/conversationSearch.js`).
// No React Native imports so they can be checked with `node` type stripping.

import { messagePreviewText } from "./attachments";

type Participant = { id: number; username: string; native_language?: string | null };
type ListConversation = {
  sender: Participant;
  receiver: Participant;
  updated_at?: string;
  last_message?: {
    text?: string | null;
    attachment_url?: string | null;
    local_mime_type?: string | null;
    timestamp?: string;
    status?: "sent" | "delivered" | "read";
    sender?: { id?: number | null } | null;
  } | null;
};

const normalize = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** The participant who isn't the viewer (`sender`/`receiver` are creator/other, not viewer). */
export function getOtherParticipant<T extends ListConversation>(
  conversation: T,
  viewerUsername?: string | null
): T["sender"] {
  return conversation.sender.username === viewerUsername ? conversation.receiver : conversation.sender;
}

/** Matches the other participant's username, native language or the last message text. Accent-insensitive. */
export function conversationMatchesQuery(
  conversation: ListConversation,
  query: string,
  viewerUsername?: string | null
) {
  const needle = normalize(query);
  if (!needle) return true;
  const other = getOtherParticipant(conversation, viewerUsername);
  return [other?.username, other?.native_language, conversation.last_message?.text].some((value) =>
    normalize(value).includes(needle)
  );
}

export function filterConversations<T extends ListConversation>(
  conversations: T[],
  query: string,
  viewerUsername?: string | null
): T[] {
  return normalize(query)
    ? conversations.filter((conversation) => conversationMatchesQuery(conversation, query, viewerUsername))
    : conversations;
}

/** The pinned Lumi row stays visible unless the query clearly doesn't match it. */
export function coachMatchesQuery(query: string) {
  const needle = normalize(query);
  if (!needle) return true;
  return ["lumi", "ai", "coach"].some((value) => value.includes(needle));
}

/** True when some listed conversation is with exactly this username (case-insensitive). */
export function hasConversationWith(
  conversations: ListConversation[],
  username: string,
  viewerUsername?: string | null
) {
  const needle = username.trim().toLowerCase();
  if (!needle) return false;
  return conversations.some(
    (conversation) => getOtherParticipant(conversation, viewerUsername)?.username.toLowerCase() === needle
  );
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

function safeFormat(options: Intl.DateTimeFormatOptions, date: Date) {
  try {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  } catch {
    return "";
  }
}

/** "10:22 AM" today, "Yesterday", a weekday within the last week, otherwise "Mar 3" (or with year). */
export function formatListTime(timestamp?: string | null, now: Date = new Date()) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (days <= 0) return safeFormat({ hour: "numeric", minute: "2-digit" }, date);
  if (days === 1) return "Yesterday";
  if (days < 7) return safeFormat({ weekday: "short" }, date);
  return safeFormat(
    date.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
    date
  );
}

export type ConversationPreview = {
  /** Preview line text ("Typing…", message text, attachment label or "No messages yet"). */
  text: string;
  typing: boolean;
  /** Tick glyphs for the viewer's own last message ("✓" / "✓✓"), or null. */
  ticks: string | null;
  ticksRead: boolean;
  /** Accessible status for the ticks ("Sent" / "Delivered" / "Seen"), or null. */
  ticksLabel: string | null;
};

/** List preview for a conversation row. */
export function conversationPreview(
  conversation: ListConversation,
  currentUserId: number | undefined,
  isTyping: boolean
): ConversationPreview {
  if (isTyping) return { text: "Typing…", typing: true, ticks: null, ticksRead: false, ticksLabel: null };
  const lastMessage = conversation.last_message;
  const text = messagePreviewText(lastMessage) || (lastMessage ? "Message" : "No messages yet");
  const isOwn = Boolean(lastMessage && currentUserId != null && lastMessage.sender?.id === currentUserId);
  if (!isOwn) return { text, typing: false, ticks: null, ticksRead: false, ticksLabel: null };
  const status = lastMessage?.status || "sent";
  return {
    text,
    typing: false,
    ticks: status === "sent" ? "✓" : "✓✓",
    ticksRead: status === "read",
    ticksLabel: status === "read" ? "Seen" : status === "delivered" ? "Delivered" : "Sent",
  };
}

/** Header status line: typing wins, then "Online now"; null when offline (no last-seen data on mobile). */
export function presenceLabel(isTyping: boolean, isOnline: boolean) {
  if (isTyping) return "typing…";
  if (isOnline) return "Online now";
  return null;
}

/** Unread badge text, capped like web. */
export function unreadBadgeText(count: number) {
  return count > 99 ? "99+" : String(count);
}

/** Two-letter initials for avatar fallbacks. */
export function initialsFor(name?: string | null) {
  const parts = String(name || "")
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
