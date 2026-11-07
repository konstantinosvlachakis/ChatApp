// Pure helpers for guided exchange sessions (no RN imports; tested with node).
// Times: the server sends ISO timestamps plus `server_time`; clients keep
// offset = server_time - Date.now() (at receipt) and compare timestamps to Date.now() + offset.
import type { ExchangeSession, ExchangeSessionStatus, ExchangeSessionSummary } from "../types";

export const EXCHANGE_DURATIONS = [10, 20, 30];
export const DEFAULT_EXCHANGE_DURATION = 20;
/** The halfway nudge only shows if the chat is on screen within this long after the switch point. */
export const HALFWAY_NUDGE_WINDOW_MS = 2 * 60 * 1000;
export const EXCHANGE_TOPIC_MAX = 120;

export type SessionRole = "starter" | "partner" | null;

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? null : value;
}

/** server_time - local receipt time, in ms (0 when server_time is missing/invalid). */
export function clockOffsetMs(serverTime: string | null | undefined, receivedAt = Date.now()) {
  const server = ms(serverTime);
  return server == null ? 0 : server - receivedAt;
}

/** The server's "now" estimate. */
export function serverNow(offsetMs: number, now = Date.now()) {
  return now + offsetMs;
}

export function isOpenSession(session: Pick<ExchangeSession, "status"> | null | undefined) {
  return session?.status === "pending" || session?.status === "active";
}

export function sessionRole(session: ExchangeSession | null | undefined, userId: number | undefined): SessionRole {
  if (!session || !userId) return null;
  if (session.created_by?.id === userId) return "starter";
  if (session.partner?.id === userId) return "partner";
  return null;
}

/** The other person in the session, from my point of view. */
export function sessionPartnerName(session: ExchangeSession, userId: number | undefined) {
  return session.created_by?.id === userId ? session.partner?.username || "" : session.created_by?.username || "";
}

/** When the second language starts: min(switched_at, halfway_at). */
export function switchPointMs(session: ExchangeSession): number | null {
  const halfway = ms(session.halfway_at);
  const switched = ms(session.switched_at);
  if (halfway == null) return switched;
  if (switched == null) return halfway;
  return Math.min(halfway, switched);
}

/** pending → expires_at, active → ends_at, else null. */
export function sessionDeadlineMs(session: ExchangeSession | null | undefined): number | null {
  if (!session) return null;
  if (session.status === "pending") return ms(session.expires_at);
  if (session.status === "active") return ms(session.ends_at);
  return null;
}

/** ms until the deadline (never negative); null when the session has none. */
export function remainingMs(session: ExchangeSession | null | undefined, offsetMs: number, now = Date.now()) {
  const deadline = sessionDeadlineMs(session);
  if (deadline == null) return null;
  return Math.max(0, deadline - serverNow(offsetMs, now));
}

/** True once a pending invite expired or an active session's timer ran out (refetch then). */
export function isPastDeadline(session: ExchangeSession | null | undefined, offsetMs: number, now = Date.now()) {
  const deadline = sessionDeadlineMs(session);
  return deadline != null && serverNow(offsetMs, now) >= deadline;
}

/** Active only: first language before the switch point, then second. */
export function currentLanguageAt(session: ExchangeSession | null | undefined, offsetMs: number, now = Date.now()) {
  if (!session || session.status !== "active") return null;
  const point = switchPointMs(session);
  if (point != null && serverNow(offsetMs, now) >= point) return session.second_language;
  return session.first_language;
}

/** "Switch now" is offered while active, not yet switched and before halfway. */
export function canSwitchNow(session: ExchangeSession | null | undefined, offsetMs: number, now = Date.now()) {
  if (!session || session.status !== "active" || session.switched_at) return false;
  const halfway = ms(session.halfway_at);
  return halfway == null || serverNow(offsetMs, now) < halfway;
}

/** 0..1 of the active session elapsed. */
export function sessionProgress(session: ExchangeSession | null | undefined, offsetMs: number, now = Date.now()) {
  if (!session || session.status !== "active") return session?.status === "ended" ? 1 : 0;
  const start = ms(session.started_at);
  const end = ms(session.ends_at);
  if (start == null || end == null || end <= start) return 0;
  return clamp01((serverNow(offsetMs, now) - start) / (end - start));
}

/** Where the switch point sits on the progress bar (0..1; 0.5 for a plain halfway). */
export function switchFraction(session: ExchangeSession) {
  const start = ms(session.started_at);
  const end = ms(session.ends_at);
  const point = switchPointMs(session);
  if (start == null || end == null || point == null || end <= start) return 0.5;
  return clamp01((point - start) / (end - start));
}

/**
 * The one-time "Time to switch" nudge: the timer reached halfway (no early switch) less than
 * HALFWAY_NUDGE_WINDOW_MS ago.
 */
export function isHalfwayNudgeDue(session: ExchangeSession | null | undefined, offsetMs: number, now = Date.now()) {
  if (!session || session.status !== "active") return false;
  const halfway = ms(session.halfway_at);
  if (halfway == null) return false;
  const switched = ms(session.switched_at);
  if (switched != null && switched < halfway) return false;
  const elapsed = serverNow(offsetMs, now) - halfway;
  return elapsed >= 0 && elapsed < HALFWAY_NUDGE_WINDOW_MS;
}

/** "mm:ss" (or "h:mm:ss"), from ms; rounds up so 0:00 means done. */
export function formatCountdown(remaining: number | null | undefined) {
  if (remaining == null || !Number.isFinite(remaining)) return "";
  const total = Math.max(0, Math.ceil(remaining / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  return `${minutes}:${ss}`;
}

/** Screen-reader form: "14 minutes 32 seconds". */
export function spokenCountdown(remaining: number | null | undefined) {
  if (remaining == null || !Number.isFinite(remaining)) return "";
  const total = Math.max(0, Math.ceil(remaining / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  if (seconds || !minutes) parts.push(`${seconds} ${seconds === 1 ? "second" : "seconds"}`);
  return parts.join(" ");
}

export function exchangeLanguageLabel(language: string | null | undefined) {
  const value = String(language || "").trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

/** "10.2" / "10" minutes (one decimal, trailing .0 dropped). */
export function formatMinutes(minutes: number | null | undefined) {
  const value = Math.max(0, Number(minutes) || 0);
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Start-sheet defaults from GET session: default_languages if valid, else the first two. */
export function defaultLanguagePair(languages: string[], defaults: string[]): [string, string] | null {
  const list = Array.from(new Set((languages || []).map((l) => String(l || "").toLowerCase()).filter(Boolean)));
  const [first, second] = (defaults || []).map((l) => String(l || "").toLowerCase());
  if (first && second && first !== second && list.includes(first) && list.includes(second)) return [first, second];
  const pickFirst = first && list.includes(first) ? first : list[0];
  const pickSecond = list.find((l) => l !== pickFirst);
  return pickFirst && pickSecond ? [pickFirst, pickSecond] : null;
}

/** Choosing a language in one slot: picking the other slot's language swaps them. */
export function chooseLanguage(
  pair: [string, string],
  slot: 0 | 1,
  language: string
): [string, string] {
  const other = slot === 0 ? 1 : 0;
  if (pair[other] === language) return [pair[1], pair[0]];
  const next: [string, string] = [pair[0], pair[1]];
  next[slot] = language;
  return next;
}

/** Note for a closed session that never ran (declined/cancelled/expired). */
export function closedSessionNote(session: ExchangeSession, userId: number | undefined) {
  const role = sessionRole(session, userId);
  const partner = sessionPartnerName(session, userId) || "Your partner";
  switch (session.status as ExchangeSessionStatus) {
    case "declined":
      return role === "partner" ? "You declined the exchange invite." : `${partner} declined the exchange.`;
    case "cancelled":
      return role === "starter" ? "You cancelled the exchange invite." : `${partner} cancelled the exchange invite.`;
    case "expired":
      return "The exchange invite expired before it started.";
    default:
      return "";
  }
}

/** "Time's up" or who ended it. */
export function endedReason(session: ExchangeSession, userId: number | undefined) {
  if (session.status !== "ended") return "";
  if (session.ended_by_id == null) return "Time's up";
  if (session.ended_by_id === userId) return "You ended the exchange";
  const name =
    session.ended_by_id === session.created_by?.id ? session.created_by.username : session.partner?.username;
  return `${name || "Your partner"} ended the exchange`;
}

export type BalanceSegment = { language: string; label: string; minutes: number; fraction: number };

/** Two-segment language balance by minutes (fractions sum to 1, or both 0 if no time). */
export function languageBalance(summary: ExchangeSessionSummary | null | undefined): BalanceSegment[] {
  const rows = summary?.languages || [];
  const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row.minutes) || 0), 0);
  return rows.map((row) => {
    const minutes = Math.max(0, Number(row.minutes) || 0);
    return {
      language: row.language,
      label: exchangeLanguageLabel(row.language),
      minutes,
      fraction: total > 0 ? minutes / total : 0,
    };
  });
}

export type PersonMessageRow = {
  userId: number;
  name: string;
  isMe: boolean;
  counts: Array<{ language: string; label: string; count: number }>;
  total: number;
};

/** Messages per person per language, me first. */
export function messagesPerPerson(
  session: ExchangeSession,
  userId: number | undefined
): PersonMessageRow[] {
  const languages = session.summary?.languages || [];
  const people = [session.created_by, session.partner].filter(Boolean);
  const rows = people.map((person) => {
    const counts = languages.map((row) => ({
      language: row.language,
      label: exchangeLanguageLabel(row.language),
      count: Math.max(0, Number(row.messages?.[String(person.id)]) || 0),
    }));
    return {
      userId: person.id,
      name: person.id === userId ? "You" : person.username,
      isMe: person.id === userId,
      counts,
      total: counts.reduce((sum, c) => sum + c.count, 0),
    };
  });
  return rows.sort((a, b) => Number(b.isMe) - Number(a.isMe));
}

export function correctionsLine(summary: ExchangeSessionSummary | null | undefined) {
  const count = Math.max(0, Number(summary?.correction_count) || 0);
  if (!count) return "No corrections during this session";
  return `${count} ${count === 1 ? "correction" : "corrections"} during this session`;
}

/** "20-minute exchange: English, then Spanish". */
export function sessionPlanLine(
  session: Pick<ExchangeSession, "duration_minutes" | "first_language" | "second_language">
) {
  return `${session.duration_minutes}-minute exchange: ${exchangeLanguageLabel(session.first_language)}, then ${exchangeLanguageLabel(session.second_language)}`;
}

/** Friendly text for exchange API error codes. */
export function exchangeErrorText(code: string | undefined, fallback: string) {
  switch (code) {
    case "invalid_duration":
      return "Choose 10, 20 or 30 minutes.";
    case "invalid_languages":
      return "Pick two different languages that one of you speaks or learns.";
    case "blocked":
      return "You can't start an exchange with this person.";
    case "session_exists":
      return "There's already an exchange in this chat.";
    case "not_invitee":
      return "Only the invited person can answer this invite.";
    case "not_starter":
      return "Only the person who started the exchange can cancel it.";
    case "not_participant":
      return "You're not part of this exchange.";
    case "session_not_pending":
      return "This invite was already answered.";
    case "session_not_active":
      return "This exchange is no longer running.";
    case "already_switched":
      return "You've already switched languages.";
    case "group_not_supported":
      return "Guided exchanges are for one-to-one chats.";
    default:
      return fallback;
  }
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
