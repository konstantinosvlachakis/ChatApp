// "Seen by" for group chats (mirrors web `utils/groupReads.js`). Each member has a read
// position (last_read_at); a message is seen by the members whose position is at or after
// its timestamp. No React Native imports.

type ReadParticipant = {
  user: { id: number; username: string };
  status: "active" | "pending";
  nickname?: string;
  last_read_at?: string | null;
};
type SeenMessage = { id: number; timestamp: string; sender?: { id?: number | null } | null; local_status?: string };

const toTime = (value?: string | null) => {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(time) ? null : time;
};

/** Keep the later of two read positions (a refetch must not move one backwards). */
export function mergeReads(current: Record<number, string | null>, participants: ReadParticipant[] = []) {
  const next: Record<number, string | null> = { ...current };
  participants
    .filter((participant) => participant.status === "active" && participant.user?.id)
    .forEach((participant) => {
      const id = participant.user.id;
      const incoming = toTime(participant.last_read_at);
      const existing = toTime(next[id]);
      if (incoming !== null && (existing === null || incoming > existing)) {
        next[id] = participant.last_read_at ?? null;
      } else if (!(id in next)) {
        next[id] = participant.last_read_at ?? null;
      }
    });
  return next;
}

/** The viewer's latest sent message and who (other active members) has read it. */
export function buildSeenBy(
  messages: SeenMessage[],
  reads: Record<number, string | null>,
  participants: ReadParticipant[] = [],
  viewerId?: number
): { messageId: number; label: string; readers: string[] } | null {
  const lastOwn = [...messages]
    .reverse()
    .find((message) => message.sender?.id === viewerId && message.local_status !== "sending" && message.id > 0);
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

  let label = "Sent";
  if (others.length && readers.length === others.length) {
    label = others.length === 1 ? `Seen by ${readers[0]}` : "Seen by everyone";
  } else if (readers.length) {
    const shown = readers.slice(0, 2).join(", ");
    label = readers.length > 2 ? `Seen by ${shown} +${readers.length - 2}` : `Seen by ${shown}`;
  }
  return { messageId: lastOwn.id, label, readers };
}
