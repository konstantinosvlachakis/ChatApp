// Grouping of consecutive chat messages (mirrors web `pages/Conversations/utils/messageGroups.js`):
// the avatar, time and ticks are shown once per group instead of under every bubble. A new group
// starts on a sender change, a new day, the unread divider, or a pause of GROUP_GAP_MINUTES or more.
// Pure (no React Native imports) so it can be checked with `node` type stripping.

import { formatDaySeparator, getDayKey } from "./format";

export const GROUP_GAP_MINUTES = 5;

type GroupableMessage = {
  id: number;
  timestamp?: string | null;
  sender?: { id?: number | null } | null;
};

export type MessageGroupFlags = {
  /** First bubble of a group (extra top spacing, rounded top corner on the sender side). */
  startsGroup: boolean;
  /** Last bubble of a group (avatar, time and ticks are shown here). */
  endsGroup: boolean;
  /** Day separator label above this message, or null when the previous one is on the same day. */
  dayLabel: string | null;
};

function minutesBetween(left?: string | null, right?: string | null) {
  const a = left ? new Date(left).getTime() : NaN;
  const b = right ? new Date(right).getTime() : NaN;
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(b - a) / 60000;
}

/** Flags per message id for a chronologically sorted list. */
export function getMessageGroupFlags(
  messages: GroupableMessage[],
  unreadAnchorMessageId: number | null = null
): Record<number, MessageGroupFlags> {
  const result: Record<number, MessageGroupFlags> = {};
  let previous: GroupableMessage | null = null;
  let previousFlags: MessageGroupFlags | null = null;
  for (const message of messages) {
    const dayKey = getDayKey(message.timestamp);
    const showDaySeparator = Boolean(dayKey) && dayKey !== getDayKey(previous?.timestamp);
    const showUnreadDivider = unreadAnchorMessageId != null && message.id === unreadAnchorMessageId;
    const startsGroup =
      !previous ||
      previous.sender?.id !== message.sender?.id ||
      showDaySeparator ||
      showUnreadDivider ||
      minutesBetween(previous.timestamp, message.timestamp) >= GROUP_GAP_MINUTES;
    const flags: MessageGroupFlags = {
      startsGroup,
      endsGroup: true,
      dayLabel: showDaySeparator ? formatDaySeparator(message.timestamp) : null,
    };
    if (previousFlags) previousFlags.endsGroup = startsGroup;
    result[message.id] = flags;
    previous = message;
    previousFlags = flags;
  }
  return result;
}
