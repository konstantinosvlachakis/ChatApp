// Message formatting helpers shared by ConversationsScreen, MessageRow and Composer.

export const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function statusTicks(status?: string) {
  if (status === "read") return "✓✓";
  if (status === "delivered") return "✓✓";
  return "✓";
}

export function toReplyPreviewText(message?: { text?: string | null } | null) {
  if (!message?.text) return "Attachment";
  const trimmed = message.text.trim();
  if (!trimmed) return "Attachment";
  return trimmed.length > 70 ? `${trimmed.slice(0, 70)}...` : trimmed;
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
