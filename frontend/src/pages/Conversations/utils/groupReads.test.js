import { buildSeenBy, mergeReads } from "./groupReads";
import { conversationMatchesQuery, conversationTitle, getOtherParticipant, groupMembers } from "./conversationSearch";

const member = (id, username, lastReadAt, status = "active") => ({
  user: { id, username },
  role: id === 1 ? "owner" : "member",
  status,
  joined_at: "2026-11-01T10:00:00Z",
  last_read_at: lastReadAt,
});

const participants = [
  member(1, "me", "2026-11-04T10:00:00Z"),
  member(2, "ana", "2026-11-04T10:05:00Z"),
  member(3, "ben", "2026-11-04T09:00:00Z"),
  member(4, "cara", null, "pending"),
];
const messages = [
  { id: 10, sender: { id: 2 }, timestamp: "2026-11-04T09:30:00Z" },
  { id: 11, sender: { id: 1 }, timestamp: "2026-11-04T10:01:00Z" },
];

describe("buildSeenBy", () => {
  test("names the members who read my latest message (pending invitees don't count)", () => {
    expect(buildSeenBy(messages, {}, participants, 1)).toEqual({
      messageId: 11,
      label: "Seen by ana",
      readers: ["ana"],
      allRead: false,
    });
  });

  test("uses a group nickname in read receipts", () => {
    const named = participants.map((row) => row.user.id === 2 ? { ...row, nickname: "Annie" } : row);
    expect(buildSeenBy(messages, {}, named, 1).label).toBe("Seen by Annie");
  });

  test("says everyone once every other member has read it", () => {
    const reads = { 3: "2026-11-04T10:02:00Z" };
    expect(buildSeenBy(messages, reads, participants, 1)).toMatchObject({ label: "Seen by everyone", allRead: true });
  });

  test("no label when nobody has read it (ticks only), and null before I've written anything", () => {
    expect(buildSeenBy(messages, { 2: "2026-11-04T09:59:00Z" }, participants, 1)).toMatchObject({
      label: null,
      readers: [],
      allRead: false,
    });
    expect(buildSeenBy([messages[0]], {}, participants, 1)).toBeNull();
  });

  test("skips messages still sending", () => {
    const pending = [...messages, { id: 12, sender: { id: 1 }, timestamp: "2026-11-04T11:00:00Z", isPending: true }];
    expect(buildSeenBy(pending, {}, participants, 1).messageId).toBe(11);
  });
});

test("mergeReads never moves a read position backwards", () => {
  const merged = mergeReads({ 2: "2026-11-04T12:00:00Z" }, participants);
  expect(merged[2]).toBe("2026-11-04T12:00:00Z");
  expect(merged[3]).toBe("2026-11-04T09:00:00Z");
  expect(merged).not.toHaveProperty("4");
});

describe("group helpers", () => {
  const group = {
    kind: "group",
    name: "",
    display_name: "ana, ben & you",
    sender: { id: 1, username: "me" },
    receiver: null,
    participants,
    last_message: { text: "Καλημέρα" },
  };

  test("a group has no single other participant and is titled by its display name", () => {
    expect(getOtherParticipant(group, "ana")).toBeNull();
    expect(conversationTitle(group, "ana")).toBe("ana, ben & you");
    expect(groupMembers(group).map((user) => user.username)).toEqual(["me", "ana", "ben"]);
  });

  test("search matches a group's name, members and last message", () => {
    expect(conversationMatchesQuery(group, "ben", "me")).toBe(true);
    expect(conversationMatchesQuery(group, "kalim", "me")).toBe(false);
    expect(conversationMatchesQuery(group, "Καλη", "me")).toBe(true);
    expect(conversationMatchesQuery(group, "cara", "me")).toBe(false);
  });

  test("direct chats still resolve the other person", () => {
    const direct = { sender: { username: "me" }, receiver: { username: "ana" } };
    expect(getOtherParticipant(direct, "me").username).toBe("ana");
    expect(conversationTitle(direct, "me")).toBe("ana");
  });
});
