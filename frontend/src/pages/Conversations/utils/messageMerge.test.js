import { mergeLatestPage, prependOlderMessages, restoreMessage } from "./messageMerge";

const msg = (id, extra = {}) => ({ id, text: `m${id}`, ...extra });

describe("mergeLatestPage", () => {
  test("keeps optimistic, system and newer local messages the page doesn't have", () => {
    const prev = [
      msg(1),
      msg(2),
      msg(1700000000000, { isPending: true }),
      msg("call-summary-1", { isSystem: true }),
      msg(12),
    ];
    const page = [msg(5), msg(6), msg(10, { text: "fresh" })];

    expect(mergeLatestPage(prev, page).map((m) => m.id)).toEqual([
      5,
      6,
      10,
      1700000000000,
      "call-summary-1",
      12,
    ]);
  });

  test("the page wins for ids it contains and older local entries are dropped", () => {
    const merged = mergeLatestPage([msg(3, { text: "stale" }), msg(10, { text: "old" })], [
      msg(10, { text: "fresh" }),
    ]);
    expect(merged).toEqual([msg(10, { text: "fresh" })]);
  });

  test("an empty page keeps local-only entries", () => {
    expect(mergeLatestPage([msg(9, { isPending: true })], []).map((m) => m.id)).toEqual([9]);
  });
});

describe("prependOlderMessages", () => {
  test("prepends unseen older messages and keeps the same array when nothing is new", () => {
    const prev = [msg(5), msg(6)];
    expect(prependOlderMessages(prev, [msg(3), msg(5)]).map((m) => m.id)).toEqual([3, 5, 6]);
    expect(prependOlderMessages(prev, [msg(5)])).toBe(prev);
    expect(prependOlderMessages(prev, [])).toBe(prev);
  });
});

describe("restoreMessage", () => {
  test("re-inserts after its previous neighbour", () => {
    expect(restoreMessage([msg(1), msg(3), msg(4)], msg(2), 1, 1).map((m) => m.id)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  test("goes first when it had no neighbour, falls back to its index, and never duplicates", () => {
    expect(restoreMessage([msg(2)], msg(1), null, 0).map((m) => m.id)).toEqual([1, 2]);
    expect(restoreMessage([msg(1), msg(4)], msg(3), 99, 1).map((m) => m.id)).toEqual([1, 3, 4]);
    const list = [msg(1)];
    expect(restoreMessage(list, msg(1), null, 0)).toBe(list);
  });
});
