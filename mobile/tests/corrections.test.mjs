import assert from "node:assert/strict";
import test from "node:test";
import { describeWordDiff, diffWords, hasWordChanges, tokenizeWords } from "../src/features/wordDiff.ts";
import {
  canRequestCorrections,
  canSuggestCorrection,
  findMyCorrection,
  formatRelativeDue,
  languageLabel,
  reviewPrompt,
} from "../src/features/corrections.ts";

test("tokenizes on whitespace", () => {
  assert.deepEqual(tokenizeWords("  I  goed\nhome. "), ["I", "goed", "home."]);
  assert.deepEqual(tokenizeWords(""), []);
  assert.deepEqual(tokenizeWords(null), []);
});

test("a replaced word shows removed then added", () => {
  const segments = diffWords("Yesterday I goed to school", "Yesterday I went to school");
  assert.deepEqual(segments, [
    { type: "same", text: "Yesterday I" },
    { type: "removed", text: "goed" },
    { type: "added", text: "went" },
    { type: "same", text: "to school" },
  ]);
  assert.equal(describeWordDiff(segments), '"goed" changed to "went"');
});

test("insertions and deletions", () => {
  const inserted = diffWords("I went to school", "I went to the school");
  assert.deepEqual(inserted, [
    { type: "same", text: "I went to" },
    { type: "added", text: "the" },
    { type: "same", text: "school" },
  ]);
  assert.equal(describeWordDiff(inserted), 'added "the"');

  const removed = diffWords("I very much like it", "I like it");
  assert.deepEqual(removed, [
    { type: "same", text: "I" },
    { type: "removed", text: "very much" },
    { type: "same", text: "like it" },
  ]);
  assert.equal(describeWordDiff(removed), 'removed "very much"');
});

test("several separate changes and case fixes", () => {
  const segments = diffWords("i has a dog and two cat", "I have a dog and two cats");
  assert.equal(segments.filter((s) => s.type === "removed").map((s) => s.text).join("|"), "i has|cat");
  assert.equal(segments.filter((s) => s.type === "added").map((s) => s.text).join("|"), "I have|cats");
  assert.ok(hasWordChanges(segments));
});

test("identical and empty texts", () => {
  const same = diffWords("Hola  amigo", "Hola amigo");
  assert.deepEqual(same, [{ type: "same", text: "Hola amigo" }]);
  assert.equal(hasWordChanges(same), false);
  assert.equal(describeWordDiff(same), "");
  assert.deepEqual(diffWords("", "Hola"), [{ type: "added", text: "Hola" }]);
  assert.deepEqual(diffWords("Hola", ""), [{ type: "removed", text: "Hola" }]);
});

test("very long texts fall back to a replaced middle", () => {
  const a = Array.from({ length: 900 }, (_, i) => `a${i}`).join(" ");
  const b = Array.from({ length: 900 }, (_, i) => `b${i}`).join(" ");
  const segments = diffWords(`start ${a} end`, `start ${b} end`);
  assert.deepEqual(segments.map((s) => s.type), ["same", "removed", "added", "same"]);
});

const message = (overrides = {}) => ({
  id: 5,
  text: "I goed home",
  kind: "text",
  sender: { id: 2, username: "ana" },
  timestamp: "2026-11-07T10:00:00Z",
  accepts_corrections: true,
  corrections: [],
  ...overrides,
});

test("who can correct or ask for corrections", () => {
  assert.equal(canSuggestCorrection(message(), 1), true);
  assert.equal(canSuggestCorrection(message(), 2), false, "own message");
  assert.equal(canSuggestCorrection(message({ accepts_corrections: false }), 1), false);
  assert.equal(canSuggestCorrection(message({ kind: "sticker", text: "" }), 1), false);
  assert.equal(canSuggestCorrection(message({ id: -3 }), 1), false, "optimistic bubble");
  assert.equal(canRequestCorrections(message(), 2, "when_asked"), true);
  assert.equal(canRequestCorrections(message(), 2, "often"), false);
  assert.equal(canRequestCorrections(message(), 1, "when_asked"), false);
});

test("finds my correction", () => {
  const mine = { id: 9, corrector: { id: 1, username: "me" }, corrected_text: "I went home", note: "", created_at: "", updated_at: "" };
  assert.equal(findMyCorrection(message({ corrections: [mine] }), 1), mine);
  assert.equal(findMyCorrection(message({ corrections: [mine] }), 3), null);
});

test("review card front falls back meaning > context > note > recall", () => {
  const base = { meaning: "", context: "", note: "", language: "spanish" };
  assert.equal(reviewPrompt({ ...base, meaning: "hello", context: "x" }).text, "hello");
  assert.equal(reviewPrompt({ ...base, context: "ana: hola" }).kind, "context");
  assert.equal(reviewPrompt({ ...base, note: "informal" }).kind, "note");
  assert.deepEqual(reviewPrompt(base), { kind: "recall", label: "Spanish", text: "Recall this phrase" });
  assert.equal(languageLabel("greek"), "Greek");
});

test("relative due times", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");
  assert.equal(formatRelativeDue("2026-11-07T11:00:00Z", now), "now");
  assert.equal(formatRelativeDue("2026-11-07T12:10:00Z", now), "in 10 min");
  assert.equal(formatRelativeDue("2026-11-07T15:00:00Z", now), "in 3 h");
  assert.equal(formatRelativeDue("2026-11-08T12:00:00Z", now), "tomorrow");
  assert.equal(formatRelativeDue("2026-11-11T12:00:00Z", now), "in 4 days");
  assert.equal(formatRelativeDue(null, now), "");
});
