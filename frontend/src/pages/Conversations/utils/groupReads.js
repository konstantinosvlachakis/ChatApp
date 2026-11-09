// "Seen by" for group chats: each member has a read position (last_read_at); a message
// is seen by the members whose position is at or after its timestamp.

const toTime = (value) => {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(time) ? null : time;
};

/** Keep the later of two read positions (a refetch must not move one backwards). */
export const mergeReads = (current, participants = []) => {
  const next = { ...current };
  participants
    .filter((participant) => participant.status === "active" && participant.user?.id)
    .forEach((participant) => {
      const id = participant.user.id;
      const incoming = toTime(participant.last_read_at);
      const existing = toTime(next[id]);
      if (incoming !== null && (existing === null || incoming > existing)) {
        next[id] = participant.last_read_at;
      } else if (!(id in next)) {
        next[id] = participant.last_read_at || null;
      }
    });
  return next;
};

/**
 * The viewer's latest sent message and who (other active members) has read it.
 * Returns { messageId, label, readers, allRead } or null when the viewer hasn't sent anything
 * yet. label is null until someone has read it (the ticks show "sent" on their own).
 */
export const buildSeenBy = (messages = [], reads = {}, participants = [], viewerId) => {
  const lastOwn = [...messages]
    .reverse()
    .find((message) => message?.sender?.id === viewerId && !message.isPending && !message.isSystem);
  if (!lastOwn) return null;
  const sentAt = toTime(lastOwn.timestamp);
  const others = participants.filter(
    (participant) => participant.status === "active" && participant.user?.id && participant.user.id !== viewerId
  );
  const readers = others
    .filter((participant) => {
      const readAt = toTime(reads[participant.user.id] ?? participant.last_read_at);
      return readAt !== null && sentAt !== null && readAt >= sentAt;
    })
    .map((participant) => participant.nickname || participant.user.username);

  const allRead = others.length > 0 && readers.length === others.length;
  let label = null;
  if (allRead) {
    label = others.length === 1 ? `Seen by ${readers[0]}` : "Seen by everyone";
  } else if (readers.length) {
    const shown = readers.slice(0, 2).join(", ");
    label = readers.length > 2 ? `Seen by ${shown} +${readers.length - 2}` : `Seen by ${shown}`;
  }
  return { messageId: lastOwn.id, label, readers, allRead };
};
