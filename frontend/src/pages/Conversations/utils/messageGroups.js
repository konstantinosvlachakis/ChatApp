// Grouping of consecutive chat messages: the avatar and timestamp/status are shown once per
// group instead of under every bubble. A new group starts on a sender change, a system
// message, a new day, the unread divider, or a pause of GROUP_GAP_MINUTES or more.

export const GROUP_GAP_MINUTES = 5;

export const getDayKey = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const minutesBetween = (left, right) => {
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(b - a) / 60000;
};

/**
 * @returns {Array<{isSentByUser: boolean, startsGroup: boolean, endsGroup: boolean,
 *   showDaySeparator: boolean, showUnreadDivider: boolean}>} one entry per message.
 */
export function getMessageGroupFlags(messages, { userId, unreadAnchorMessageId = null } = {}) {
  const flags = messages.map((msg, index) => {
    const previous = index > 0 ? messages[index - 1] : null;
    const dayKey = getDayKey(msg.timestamp);
    const showDaySeparator = Boolean(dayKey) && dayKey !== getDayKey(previous?.timestamp);
    const showUnreadDivider = unreadAnchorMessageId != null && msg.id === unreadAnchorMessageId;
    const startsGroup =
      !previous ||
      Boolean(msg.isSystem) ||
      Boolean(previous.isSystem) ||
      previous.sender?.id !== msg.sender?.id ||
      showDaySeparator ||
      showUnreadDivider ||
      minutesBetween(previous.timestamp, msg.timestamp) >= GROUP_GAP_MINUTES;
    return {
      isSentByUser: msg.sender?.id != null && msg.sender.id === userId,
      startsGroup,
      endsGroup: true,
      showDaySeparator,
      showUnreadDivider,
    };
  });
  for (let index = 0; index < flags.length - 1; index += 1) {
    flags[index].endsGroup = flags[index + 1].startsGroup;
  }
  return flags;
}
