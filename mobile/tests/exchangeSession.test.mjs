import assert from "node:assert/strict";
import test from "node:test";
import {
  canSwitchNow,
  chooseLanguage,
  clockOffsetMs,
  closedSessionNote,
  correctionsLine,
  currentLanguageAt,
  defaultLanguagePair,
  endedReason,
  exchangeErrorText,
  formatCountdown,
  formatMinutes,
  isHalfwayNudgeDue,
  isOpenSession,
  isPastDeadline,
  languageBalance,
  messagesPerPerson,
  remainingMs,
  sessionPlanLine,
  sessionProgress,
  sessionRole,
  spokenCountdown,
  switchFraction,
  switchPointMs,
} from "../src/features/exchangeSession.ts";

const T0 = Date.parse("2026-11-07T10:00:00Z");
const iso = (offsetMin) => new Date(T0 + offsetMin * 60_000).toISOString();
const at = (offsetMin) => T0 + offsetMin * 60_000;

function activeSession(overrides = {}) {
  return {
    id: 7,
    conversation_id: 3,
    status: "active",
    created_by: { id: 1, username: "ana" },
    partner: { id: 2, username: "ben" },
    duration_minutes: 20,
    first_language: "english",
    second_language: "spanish",
    current_language: "english",
    topic: { id: "t1", title: "Food", prompts: ["Favourite dish?"] },
    topic_source: "library",
    created_at: iso(-2),
    expires_at: iso(8),
    started_at: iso(0),
    halfway_at: iso(10),
    switched_at: null,
    ends_at: iso(20),
    ended_at: null,
    ended_by_id: null,
    summary: null,
    server_time: iso(0),
    ...overrides,
  };
}

test("clock offset follows server_time", () => {
  assert.equal(clockOffsetMs(iso(0), T0 - 5000), 5000);
  assert.equal(clockOffsetMs(null, T0), 0);
  assert.equal(clockOffsetMs("nonsense", T0), 0);
});

test("remaining time and deadline use the offset", () => {
  const session = activeSession();
  assert.equal(remainingMs(session, 0, at(5)), 15 * 60_000);
  // Local clock 1 min behind the server: 1 min less remains.
  assert.equal(remainingMs(session, 60_000, at(5)), 14 * 60_000);
  assert.equal(remainingMs(session, 0, at(25)), 0);
  assert.equal(isPastDeadline(session, 0, at(19.9)), false);
  assert.equal(isPastDeadline(session, 0, at(20)), true);
  const pending = activeSession({ status: "pending", started_at: null, halfway_at: null, ends_at: null });
  assert.equal(remainingMs(pending, 0, at(0)), 8 * 60_000);
  assert.equal(isPastDeadline(pending, 0, at(8)), true);
  assert.equal(remainingMs(activeSession({ status: "ended" }), 0, at(0)), null);
});

test("current language switches at min(switched_at, halfway_at)", () => {
  const session = activeSession();
  assert.equal(currentLanguageAt(session, 0, at(9.9)), "english");
  assert.equal(currentLanguageAt(session, 0, at(10)), "spanish");
  const early = activeSession({ switched_at: iso(4) });
  assert.equal(switchPointMs(early), at(4));
  assert.equal(currentLanguageAt(early, 0, at(5)), "spanish");
  assert.equal(currentLanguageAt(activeSession({ status: "pending" }), 0, at(5)), null);
});

test("switch now only before halfway and once", () => {
  assert.equal(canSwitchNow(activeSession(), 0, at(5)), true);
  assert.equal(canSwitchNow(activeSession(), 0, at(10)), false);
  assert.equal(canSwitchNow(activeSession({ switched_at: iso(3) }), 0, at(5)), false);
  assert.equal(canSwitchNow(activeSession({ status: "pending" }), 0, at(5)), false);
});

test("progress and switch mark", () => {
  assert.equal(sessionProgress(activeSession(), 0, at(5)), 0.25);
  assert.equal(sessionProgress(activeSession(), 0, at(40)), 1);
  assert.equal(switchFraction(activeSession()), 0.5);
  assert.equal(switchFraction(activeSession({ switched_at: iso(4) })), 0.2);
});

test("halfway nudge is due just after halfway, not after an early switch", () => {
  assert.equal(isHalfwayNudgeDue(activeSession(), 0, at(9.5)), false);
  assert.equal(isHalfwayNudgeDue(activeSession(), 0, at(10.5)), true);
  assert.equal(isHalfwayNudgeDue(activeSession(), 0, at(13)), false);
  assert.equal(isHalfwayNudgeDue(activeSession({ switched_at: iso(4) }), 0, at(10.5)), false);
});

test("countdown formatting", () => {
  assert.equal(formatCountdown(14 * 60_000 + 32_000), "14:32");
  assert.equal(formatCountdown(500), "0:01");
  assert.equal(formatCountdown(0), "0:00");
  assert.equal(formatCountdown(3_600_000 + 5_000), "1:00:05");
  assert.equal(formatCountdown(null), "");
  assert.equal(spokenCountdown(61_000), "1 minute 1 second");
  assert.equal(spokenCountdown(120_000), "2 minutes");
  assert.equal(spokenCountdown(0), "0 seconds");
  assert.equal(formatMinutes(10.04), "10");
  assert.equal(formatMinutes(9.96), "10");
  assert.equal(formatMinutes(9.8), "9.8");
});

test("roles, statuses and notes", () => {
  const session = activeSession();
  assert.equal(sessionRole(session, 1), "starter");
  assert.equal(sessionRole(session, 2), "partner");
  assert.equal(sessionRole(session, 9), null);
  assert.equal(isOpenSession(session), true);
  assert.equal(isOpenSession(activeSession({ status: "expired" })), false);
  assert.equal(closedSessionNote(activeSession({ status: "declined" }), 1), "ben declined the exchange.");
  assert.equal(closedSessionNote(activeSession({ status: "declined" }), 2), "You declined the exchange invite.");
  assert.equal(closedSessionNote(activeSession({ status: "cancelled" }), 2), "ana cancelled the exchange invite.");
  assert.match(closedSessionNote(activeSession({ status: "expired" }), 1), /expired/);
  assert.equal(endedReason(activeSession({ status: "ended" }), 1), "Time's up");
  assert.equal(endedReason(activeSession({ status: "ended", ended_by_id: 1 }), 1), "You ended the exchange");
  assert.equal(endedReason(activeSession({ status: "ended", ended_by_id: 1 }), 2), "ana ended the exchange");
  assert.equal(sessionPlanLine(session), "20-minute exchange: English, then Spanish");
});

test("default language pair and choosing languages", () => {
  assert.deepEqual(defaultLanguagePair(["english", "french", "spanish"], ["spanish", "english"]), ["spanish", "english"]);
  assert.deepEqual(defaultLanguagePair(["english", "spanish"], ["", "english"]), ["english", "spanish"]);
  assert.deepEqual(defaultLanguagePair(["english", "spanish"], ["german", "english"]), ["english", "spanish"]);
  assert.equal(defaultLanguagePair(["english"], ["english", "english"]), null);
  assert.deepEqual(chooseLanguage(["english", "spanish"], 0, "french"), ["french", "spanish"]);
  // Picking the other slot's language swaps them.
  assert.deepEqual(chooseLanguage(["english", "spanish"], 0, "spanish"), ["spanish", "english"]);
});

test("summary balance, messages per person and corrections", () => {
  const summary = {
    languages: [
      { language: "english", minutes: 12, messages: { 1: 5, 2: 3 }, message_count: 8 },
      { language: "spanish", minutes: 8, messages: { 2: 4 }, message_count: 4 },
    ],
    total_minutes: 20,
    corrections: [],
    correction_count: 3,
    corrections_truncated: false,
  };
  const balance = languageBalance(summary);
  assert.deepEqual(
    balance.map((s) => [s.label, s.minutes, s.fraction]),
    [
      ["English", 12, 0.6],
      ["Spanish", 8, 0.4],
    ]
  );
  assert.deepEqual(languageBalance({ ...summary, languages: summary.languages.map((l) => ({ ...l, minutes: 0 })) }).map((s) => s.fraction), [0, 0]);
  const rows = messagesPerPerson(activeSession({ status: "ended", summary }), 2);
  assert.equal(rows[0].name, "You");
  assert.deepEqual(rows[0].counts.map((c) => c.count), [3, 4]);
  assert.equal(rows[1].name, "ana");
  assert.deepEqual(rows[1].counts.map((c) => c.count), [5, 0]);
  assert.equal(correctionsLine(summary), "3 corrections during this session");
  assert.equal(correctionsLine({ ...summary, correction_count: 1 }), "1 correction during this session");
  assert.equal(correctionsLine(null), "No corrections during this session");
});

test("error codes map to friendly text", () => {
  assert.match(exchangeErrorText("already_switched", "x"), /already switched/);
  assert.equal(exchangeErrorText("something_else", "fallback"), "fallback");
});
