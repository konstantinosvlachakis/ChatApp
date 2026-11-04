import assert from "node:assert/strict";
import test from "node:test";
import { gifBoxSize, isOpenableUrl, messagePreviewText } from "../src/components/chat/attachments.ts";

test("previews name stickers and GIFs instead of an empty string", () => {
  assert.equal(messagePreviewText({ kind: "sticker", text: "", media: { label: "Hello" } }), "Sticker · Hello");
  assert.equal(messagePreviewText({ kind: "sticker", text: "", media: { label: "Sticker" } }), "Sticker");
  assert.equal(messagePreviewText({ kind: "sticker", text: "", media: null }), "Sticker");
  assert.equal(messagePreviewText({ kind: "gif", text: "" }), "GIF");
  // Text and attachments are unchanged.
  assert.equal(messagePreviewText({ kind: "text", text: " hola " }), "hola");
  assert.equal(messagePreviewText({ text: "", attachment_url: "https://x.test/a.jpg" }), "Photo");
  assert.equal(messagePreviewText({ text: "" }), "");
});

test("GIF boxes keep the aspect ratio inside 220 x 260", () => {
  assert.deepEqual(gifBoxSize(200, 150), { width: 220, height: 165 });
  assert.deepEqual(gifBoxSize(200, 400), { width: 130, height: 260 });
  assert.deepEqual(gifBoxSize(0, Number.NaN), { width: 220, height: 220 });
});

test("only http(s) media URLs are shown", () => {
  assert.equal(isOpenableUrl("https://media2.giphy.com/media/x/200w.webp"), true);
  assert.equal(isOpenableUrl("javascript:alert(1)"), false);
  assert.equal(isOpenableUrl(null), false);
});
