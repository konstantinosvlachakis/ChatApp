// Message formatting helpers shared by ConversationsScreen, MessageRow and Composer.

import { messagePreviewText } from "./attachments";

export const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function statusTicks(status?: string) {
  if (status === "read") return "✓✓";
  if (status === "delivered") return "✓✓";
  return "✓";
}

/**
 * Quote text for a replied-to message. `reply_to` payloads carry no attachment, so pass the full
 * message when it is loaded to get "Photo" / "Voice message" instead of "Attachment".
 */
export function toReplyPreviewText(
  message?: { text?: string | null; attachment_url?: string | null; local_mime_type?: string | null } | null
) {
  const preview = messagePreviewText(message);
  if (!preview) return "Attachment";
  return preview.length > 70 ? `${preview.slice(0, 70)}...` : preview;
}

export function formatMessageTime(timestamp?: string | null) {
  if (!timestamp) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
      .format(new Date(timestamp))
      .replace(/\b(am|pm)\b/i, (value) => value.toUpperCase());
  } catch {
    return "";
  }
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getDayKey(timestamp?: string | null) {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  } catch {
    return "";
  }
}

export function formatDaySeparator(timestamp?: string | null) {
  if (!timestamp) return "";

  try {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (left: Date, right: Date) =>
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate();

    if (isSameDay(date, today)) return "Today";
    if (isSameDay(date, yesterday)) return "Yesterday";

    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
    }).format(date);
  } catch {
    return "";
  }
}
