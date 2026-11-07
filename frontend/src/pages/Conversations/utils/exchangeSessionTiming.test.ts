import type { ExchangeSession } from "../api/exchangeSessions";
import {
  canSwitchNow,
  clockOffsetMs,
  currentLanguageAt,
  formatCountdown,
  formatCountdownLabel,
  formatMinutes,
  languageBalance,
  languageLabel,
  nextDeadline,
  remainingMs,
  sessionPhase,
  sessionProgress,
  shouldReplaceSession,
  switchPointMs,
} from "./exchangeSessionTiming";

const T0 = Date.parse("2026-11-07T10:00:00Z");
const iso = (offsetMin: number) => new Date(T0 + offsetMin * 60_000).toISOString();

const activeSession = (overrides: Partial<ExchangeSession> = {}): ExchangeSession => ({
  id: 7,
  conversation_id: 3,
  status: "active",
  created_by: { id: 1, username: "ana" },
  partner: { id: 2, username: "ben" },
  duration_minutes: 20,
  first_language: "english",
  second_language: "spanish",
  current_language: "english",
  topic: null,
  topic_source: null,
  created_at: iso(-1),
  expires_at: iso(9),
  started_at: iso(0),
  halfway_at: iso(10),
  switched_at: null,
  ends_at: iso(20),
  ended_at: null,
  ended_by_id: null,
  summary: null,
  server_time: iso(0),
  ...overrides,
});

test("clock offset is server minus local time", () => {
  expect(clockOffsetMs(iso(0), T0 - 5000)).toBe(5000);
  expect(clockOffsetMs(null, T0)).toBe(0);
  expect(clockOffsetMs("not a date", T0)).toBe(0);
});

test("remaining time uses the corrected clock and never goes negative", () => {
  // Local clock 30 s behind the server: 20 min end, local T0 = server T0 + 30 s.
  expect(remainingMs(iso(20), T0, 30_000)).toBe(20 * 60_000 - 30_000);
  expect(remainingMs(iso(20), T0 + 25 * 60_000, 0)).toBe(0);
  expect(remainingMs(null, T0, 0)).toBeNull();
});

test("countdown formatting rounds up to whole seconds", () => {
  expect(formatCountdown(0)).toBe("0:00");
  expect(formatCountdown(400)).toBe("0:01");
  expect(formatCountdown(65_000)).toBe("1:05");
  expect(formatCountdown(20 * 60_000)).toBe("20:00");
  expect(formatCountdown(null)).toBe("0:00");
  expect(formatCountdownLabel(65_000)).toBe("1 minute 5 seconds");
  expect(formatCountdownLabel(120_000)).toBe("2 minutes");
  expect(formatCountdownLabel(0)).toBe("0 seconds");
});

test("phase and current language follow halfway with the clock offset", () => {
  const session = activeSession();
  expect(sessionPhase(session, T0 + 5 * 60_000, 0)).toBe("first");
  expect(currentLanguageAt(session, T0 + 5 * 60_000, 0)).toBe("english");
  // Local clock 1 min behind: local 9:30 is server 10:30, past halfway.
  expect(sessionPhase(session, T0 + 9.5 * 60_000, 60_000)).toBe("second");
  expect(currentLanguageAt(session, T0 + 9.5 * 60_000, 60_000)).toBe("spanish");
  expect(sessionPhase(session, T0 + 20 * 60_000, 0)).toBe("ending");
  expect(sessionPhase({ ...session, status: "pending" }, T0, 0)).toBe("pending");
  expect(sessionPhase({ ...session, status: "ended" }, T0, 0)).toBe("closed");
  expect(currentLanguageAt({ ...session, status: "ended" }, T0, 0)).toBeNull();
});

test("an early switch moves the switch point and hides Switch now", () => {
  const session = activeSession({ switched_at: iso(4) });
  expect(switchPointMs(session)).toBe(T0 + 4 * 60_000);
  expect(currentLanguageAt(session, T0 + 5 * 60_000, 0)).toBe("spanish");
  expect(canSwitchNow(session, T0 + 3 * 60_000, 0)).toBe(false);
  expect(canSwitchNow(activeSession(), T0 + 3 * 60_000, 0)).toBe(true);
  expect(canSwitchNow(activeSession(), T0 + 11 * 60_000, 0)).toBe(false);
  expect(sessionProgress(session, T0 + 5 * 60_000, 0)).toEqual({ elapsed: 0.25, switchAt: 0.2 });
  expect(sessionProgress(activeSession(), T0 + 30 * 60_000, 0).elapsed).toBe(1);
});

test("deadline is the invite expiry or the session end", () => {
  expect(nextDeadline(activeSession({ status: "pending" }))).toBe(iso(9));
  expect(nextDeadline(activeSession())).toBe(iso(20));
  expect(nextDeadline(activeSession({ status: "ended" }))).toBeNull();
  expect(nextDeadline(null)).toBeNull();
});

test("session replacement never goes back in id or status", () => {
  const pending = activeSession({ status: "pending" });
  const active = activeSession();
  expect(shouldReplaceSession(null, pending)).toBe(true);
  expect(shouldReplaceSession(pending, active)).toBe(true);
  expect(shouldReplaceSession(active, pending)).toBe(false);
  expect(shouldReplaceSession(active, { ...active, topic: { id: 1, title: "Food", prompts: [] } })).toBe(true);
  expect(shouldReplaceSession(active, activeSession({ id: 6, status: "ended" }))).toBe(false);
  expect(shouldReplaceSession(activeSession({ status: "ended" }), activeSession({ id: 8, status: "pending" }))).toBe(true);
  expect(shouldReplaceSession(active, null)).toBe(false);
});

test("language labels and balance", () => {
  expect(languageLabel("english")).toBe("English");
  expect(languageLabel("brazilian  portuguese")).toBe("Brazilian Portuguese");
  expect(languageLabel(null)).toBe("");
  const balance = languageBalance({
    languages: [
      { language: "english", minutes: 12, messages: { "1": 5, "2": 4 }, message_count: 9 },
      { language: "spanish", minutes: 4, messages: {}, message_count: 0 },
    ],
    total_minutes: 16,
    corrections: [],
    correction_count: 0,
    corrections_truncated: false,
  });
  expect(balance.map((row) => row.share)).toEqual([0.75, 0.25]);
  expect(balance[0].messageCount).toBe(9);
  expect(languageBalance(null)).toEqual([]);
  const empty = languageBalance({
    languages: [
      { language: "english", minutes: 0, messages: {}, message_count: 0 },
      { language: "spanish", minutes: 0, messages: {}, message_count: 0 },
    ],
    total_minutes: 0,
    corrections: [],
    correction_count: 0,
    corrections_truncated: false,
  });
  expect(empty.map((row) => row.share)).toEqual([0.5, 0.5]);
  expect(formatMinutes(9.6)).toBe("10 min");
  expect(formatMinutes(0.3)).toBe("<1 min");
  expect(formatMinutes(0)).toBe("0 min");
});
