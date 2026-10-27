import { GROUP_GAP_MINUTES, getMessageGroupFlags } from "./messageGroups";
import {
  coachMatchesQuery,
  filterConversations,
  formatListTime,
  getInitials,
  getOtherParticipant,
} from "./conversationSearch";

const at = (minutes, day = 15) => new Date(2026, 9, day, 10, minutes).toISOString();
const msg = (id, senderId, minutes, extra = {}) => ({ id, sender: { id: senderId }, timestamp: at(minutes), text: `m${id}`, ...extra });

describe("getMessageGroupFlags", () => {
  test("groups consecutive messages from the same sender", () => {
    const flags = getMessageGroupFlags([msg(1, 1, 0), msg(2, 1, 1), msg(3, 2, 2), msg(4, 2, 3)], { userId: 1 });
    expect(flags.map((f) => [f.startsGroup, f.endsGroup])).toEqual([
      [true, false],
      [false, true],
      [true, false],
      [false, true],
    ]);
    expect(flags.map((f) => f.isSentByUser)).toEqual([true, true, false, false]);
    expect(flags[0].showDaySeparator).toBe(true);
    expect(flags[1].showDaySeparator).toBe(false);
  });

  test("breaks a group on a long pause, a new day, a system message and the unread divider", () => {
    const messages = [
      msg(1, 2, 0),
      msg(2, 2, GROUP_GAP_MINUTES), // pause
      { ...msg(3, 2, 0), timestamp: at(0, 16) }, // next day
      { id: 4, isSystem: true, text: "Call ended", timestamp: at(1, 16) },
      { ...msg(5, 2, 0), timestamp: at(2, 16) },
      { ...msg(6, 2, 0), timestamp: at(3, 16) },
    ];
    const flags = getMessageGroupFlags(messages, { userId: 1, unreadAnchorMessageId: 6 });
    expect(flags.map((f) => f.startsGroup)).toEqual([true, true, true, true, true, true]);
    expect(flags[2].showDaySeparator).toBe(true);
    expect(flags[5].showUnreadDivider).toBe(true);
    expect(flags.every((f) => f.endsGroup)).toBe(true);
  });

  test("handles an empty list", () => {
    expect(getMessageGroupFlags([], { userId: 1 })).toEqual([]);
  });
});

describe("conversation search", () => {
  const conversations = [
    { id: 1, sender: { username: "me" }, receiver: { username: "Lucía", native_language: "spanish" }, last_message: { text: "Hasta luego" } },
    { id: 2, sender: { username: "camille" }, receiver: { username: "me" }, last_message: { text: "Merci beaucoup" } },
    { id: 3, sender: { username: "me" }, receiver: { username: "nikos" }, last_message: null },
  ];

  test("picks the other participant", () => {
    expect(getOtherParticipant(conversations[1], "me").username).toBe("camille");
    expect(getOtherParticipant(conversations[0], "me").username).toBe("Lucía");
  });

  test("filters by name (accent-insensitive), language and last message", () => {
    expect(filterConversations(conversations, "lucia", "me").map((c) => c.id)).toEqual([1]);
    expect(filterConversations(conversations, "SPANISH", "me").map((c) => c.id)).toEqual([1]);
    expect(filterConversations(conversations, "merci", "me").map((c) => c.id)).toEqual([2]);
    expect(filterConversations(conversations, "xyz", "me")).toEqual([]);
    expect(filterConversations(conversations, "  ", "me")).toBe(conversations);
  });

  test("keeps Lumi for matching queries only", () => {
    expect(coachMatchesQuery({ last_message: { text: "Hi" } }, "")).toBe(true);
    expect(coachMatchesQuery({ last_message: { text: "Hi" } }, "lum")).toBe(true);
    expect(coachMatchesQuery({ last_message: { text: "Hi" } }, "camille")).toBe(false);
  });
});

describe("formatListTime / getInitials", () => {
  const now = new Date(2026, 9, 27, 15, 0);

  test("uses relative labels", () => {
    expect(formatListTime(new Date(2026, 9, 27, 10, 22).toISOString(), now)).toMatch(/10:22/);
    expect(formatListTime(new Date(2026, 9, 26, 9, 0).toISOString(), now)).toBe("Yesterday");
    expect(formatListTime(new Date(2026, 9, 23, 9, 0).toISOString(), now)).not.toMatch(/:/);
    expect(formatListTime(new Date(2025, 0, 2).toISOString(), now)).toMatch(/2025/);
    expect(formatListTime("", now)).toBe("");
    expect(formatListTime("not a date", now)).toBe("");
  });

  test("builds initials", () => {
    expect(getInitials("konstantinos")).toBe("KO");
    expect(getInitials("maria lopez")).toBe("ML");
    expect(getInitials("")).toBe("?");
  });
});
