import assert from "node:assert/strict";
import test from "node:test";
import { confirmPendingMessage, isConfirmationOf } from "../src/components/chat/messageState.ts";
import {
  adjustUnreadCount,
  confirmReadLocally,
  forgetReadLocally,
  markReadLocally,
  resetReadState,
  subscribeToLocalReads,
} from "../src/services/readState.ts";

const me = { id: 7, username: "kv" };
const pending = (id, extra) => ({ id, local_key: String(id), sender: me, local_status: "sending", text: "", ...extra });

test("the saved message fills its optimistic bubble in place and keeps the list key", () => {
  const list = [{ id: 1, sender: { id: 2 }, text: "hi" }, pending(-5, { text: "hola" })];
  const saved = { id: 40, sender: me, text: "hola", kind: "text" };
  const next = confirmPendingMessage(list, saved);
  assert.equal(next.length, 2);
  assert.equal(next[1].id, 40);
  assert.equal(next[1].local_key, "-5");
  assert.equal(next[1].local_status, undefined);
  // The list passed in is not changed.
  assert.equal(list[1].id, -5);
});

test("the POST response confirms by optimistic id even if the text differs (trimmed by the server)", () => {
  const list = [pending(-9, { text: "  hey " })];
  const next = confirmPendingMessage(list, { id: 41, sender: me, text: "hey" }, -9);
  assert.equal(next[0].id, 41);
});

test("same text sent twice: each echo confirms the oldest pending copy", () => {
  let list = [pending(-1, { text: "ok" }), pending(-2, { text: "ok" })];
  list = confirmPendingMessage(list, { id: 50, sender: me, text: "ok" });
  assert.deepEqual(list.map((m) => m.id), [50, -2]);
  list = confirmPendingMessage(list, { id: 51, sender: me, text: "ok" });
  assert.deepEqual(list.map((m) => m.id), [50, 51]);
});

test("echoes from others, other content or other kinds don't match", () => {
  const list = [pending(-1, { text: "hola" })];
  assert.equal(confirmPendingMessage(list, { id: 3, sender: { id: 2 }, text: "hola" }), null);
  assert.equal(confirmPendingMessage(list, { id: 3, sender: me, text: "adios" }), null);
  assert.equal(confirmPendingMessage(list, { id: 3, sender: me, kind: "gif", media: { id: "g" } }), null);
});

test("stickers and GIFs match on the media, photos on caption plus having a file", () => {
  const sticker = pending(-1, { kind: "sticker", media: { pack: "lumi", id: "wave" } });
  assert.equal(isConfirmationOf(sticker, { id: 9, sender: me, kind: "sticker", media: { pack: "lumi", id: "wave" } }), true);
  assert.equal(isConfirmationOf(sticker, { id: 9, sender: me, kind: "sticker", media: { pack: "lumi", id: "cry" } }), false);
  const photo = pending(-2, { attachment_url: "file:///a.jpg" });
  assert.equal(isConfirmationOf(photo, { id: 9, sender: me, text: "", attachment_url: "https://res.test/a.jpg" }), true);
  assert.equal(isConfirmationOf(photo, { id: 9, sender: me, text: "", attachment_url: null }), false);
});

test("an opened chat counts as read until the server confirms, then until a newer fetch", () => {
  resetReadState();
  const seen = [];
  const unsubscribe = subscribeToLocalReads((id) => seen.push(id));
  markReadLocally(3);
  assert.deepEqual(seen, [3]);
  // Pending: any server count is hidden.
  assert.equal(adjustUnreadCount(3, 4, 1_000), 0);
  confirmReadLocally(3, 2_000);
  // A fetch that started before the confirmation can still carry the old count.
  assert.equal(adjustUnreadCount(3, 4, 1_500), 0);
  // A fetch started afterwards is trusted (new messages since then count) and ends the override.
  assert.equal(adjustUnreadCount(3, 1, 2_500), 1);
  assert.equal(adjustUnreadCount(3, 4, 1_500), 4);
  // Other chats are untouched.
  assert.equal(adjustUnreadCount(8, 2, 0), 2);
  unsubscribe();
});

test("a failed read request gives the count back to the server", () => {
  resetReadState();
  markReadLocally(5);
  forgetReadLocally(5);
  assert.equal(adjustUnreadCount(5, 2, 0), 2);
});
