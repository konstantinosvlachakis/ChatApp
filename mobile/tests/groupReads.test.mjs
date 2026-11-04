import assert from "node:assert/strict";
import test from "node:test";
import { buildSeenBy, mergeReads } from "../src/components/chat/groupReads.ts";

const member = (id, username, lastReadAt, status = "active") => ({
  user: { id, username },
  status,
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

test("names who read my latest message; pending invitees don't count", () => {
  assert.deepEqual(buildSeenBy(messages, {}, participants, 1), { messageId: 11, label: "Seen by ana", readers: ["ana"] });
});

test("says everyone once every other member has read it", () => {
  assert.equal(buildSeenBy(messages, { 3: "2026-11-04T10:02:00Z" }, participants, 1).label, "Seen by everyone");
});

test("Sent when nobody has read it; null before I've written anything", () => {
  assert.equal(buildSeenBy(messages, { 2: "2026-11-04T09:59:00Z" }, participants, 1).label, "Sent");
  assert.equal(buildSeenBy([messages[0]], {}, participants, 1), null);
});

test("skips optimistic messages that are still sending", () => {
  const sending = [...messages, { id: -5, sender: { id: 1 }, timestamp: "2026-11-04T11:00:00Z", local_status: "sending" }];
  assert.equal(buildSeenBy(sending, {}, participants, 1).messageId, 11);
});

test("more than two readers are summarised", () => {
  const big = [
    member(1, "me", null),
    member(2, "ana", "2026-11-04T12:00:00Z"),
    member(3, "ben", "2026-11-04T12:00:00Z"),
    member(5, "dio", "2026-11-04T12:00:00Z"),
    member(6, "eli", null),
  ];
  assert.equal(buildSeenBy(messages, {}, big, 1).label, "Seen by ana, ben +1");
});

test("mergeReads never moves a read position backwards and ignores invitees", () => {
  const merged = mergeReads({ 2: "2026-11-04T12:00:00Z" }, participants);
  assert.equal(merged[2], "2026-11-04T12:00:00Z");
  assert.equal(merged[3], "2026-11-04T09:00:00Z");
  assert.equal(4 in merged, false);
});
