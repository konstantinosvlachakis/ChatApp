import assert from "node:assert/strict";
import test from "node:test";
import { barcodeBars, boardLabel, compactCount, passProgress, routeCode } from "../src/features/boardingPass.ts";

const progress = (overrides = {}) => ({
  bucket: 1,
  max_bucket: 3,
  bucket_label: "Basics",
  attempts_in_bucket: 9,
  window_accuracy: 0.8,
  needed_for_promotion: { attempts_remaining: 6, min_attempts: 15, accuracy_target: 0.8 },
  ...overrides,
});

test("route codes look like airport codes", () => {
  assert.equal(routeCode("spanish"), "SPA");
  assert.equal(routeCode("Chinese (Mandarin)"), "CHI");
  assert.equal(routeCode(""), "---");
});

test("progress follows drills, flags low accuracy and the top level", () => {
  assert.deepEqual(passProgress(progress()), { fraction: 0.6, caption: "9/15 drills to the next level", stage: "Basics" });
  assert.deepEqual(passProgress(progress({ attempts_in_bucket: 20, window_accuracy: 0.6 })), {
    fraction: 0.9,
    caption: "Accuracy 60% · need 80%",
    stage: "Basics",
  });
  assert.equal(passProgress(progress({ attempts_in_bucket: 15, window_accuracy: null })).fraction, 1);
  assert.deepEqual(passProgress(progress({ bucket: 3, needed_for_promotion: null })), {
    fraction: 1,
    caption: "Top practice level reached",
    stage: "Basics",
  });
  assert.equal(passProgress(null), null);
});

test("board label shows the partner count once known", () => {
  assert.equal(boardLabel(null), "Find partners");
  assert.equal(boardLabel(0), "Find partners");
  assert.equal(boardLabel(1), "Board · 1 partner");
  assert.equal(boardLabel(128), "Board · 128 partners");
  assert.equal(compactCount(1234), "1.2k");
  assert.equal(compactCount(15400), "15k");
});

test("barcodes are stable per language and differ between languages", () => {
  assert.deepEqual(barcodeBars("spanishB1"), barcodeBars("spanishB1"));
  assert.notDeepEqual(barcodeBars("spanishB1"), barcodeBars("frenchA2"));
  assert.ok(barcodeBars("x").every((width) => width >= 1 && width <= 3));
});
