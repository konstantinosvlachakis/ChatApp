/**
 * Pure timing helpers for guided exchange sessions (api/exchangeSessions.ts).
 *
 * The server sends absolute ISO timestamps plus `server_time`; the client counts down locally.
 * `offsetMs` = server clock − local clock at receipt, so "server now" = Date.now() + offsetMs.
 */
import type { ExchangeSession, ExchangeSessionStatus, ExchangeSessionSummary } from "../api/exchangeSessions";

export const OPEN_STATUSES: ExchangeSessionStatus[] = ["pending", "active"];
const STATUS_RANK: Record<ExchangeSessionStatus, number> = {
  pending: 0,
  active: 1,
  ended: 2,
  declined: 2,
  cancelled: 2,
  expired: 2,
};

export const parseTime = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Server clock minus local clock, measured when a payload carrying `server_time` arrives. */
export const clockOffsetMs = (serverTime: string | null | undefined, localNowMs: number): number => {
  const server = parseTime(serverTime);
  return server === null ? 0 : server - localNowMs;
};

/** Milliseconds from (local now + offset) until `target`, never below 0. Null without a target. */
export const remainingMs = (target: string | null | undefined, localNowMs: number, offsetMs: number): number | null => {
  const at = parseTime(target);
  if (at === null) return null;
  return Math.max(0, at - (localNowMs + offsetMs));
};

/** "m:ss" for a countdown (rounded up, so 0:01 shows until the last second has passed). */
export const formatCountdown = (ms: number | null | undefined): string => {
  const totalSeconds = Math.max(0, Math.ceil((ms ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

/** Spoken form for screen readers: "12 minutes 5 seconds". */
export const formatCountdownLabel = (ms: number | null | undefined): string => {
  const totalSeconds = Math.max(0, Math.ceil((ms ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  if (seconds || !minutes) parts.push(`${seconds} second${seconds === 1 ? "" : "s"}`);
  return parts.join(" ");
};

/** When the second language starts: the earlier of a manual switch and halfway. */
export const switchPointMs = (session: Pick<ExchangeSession, "switched_at" | "halfway_at">): number | null => {
  const switched = parseTime(session.switched_at);
  const halfway = parseTime(session.halfway_at);
  if (switched === null) return halfway;
  if (halfway === null) return switched;
  return Math.min(switched, halfway);
};

export const isOpenSession = (session: Pick<ExchangeSession, "status"> | null | undefined) =>
  Boolean(session && OPEN_STATUSES.includes(session.status));

export type SessionPhase = "pending" | "first" | "second" | "ending" | "closed";

/**
 * Where an active session is at (local now + offset): `first`/`second` language, or `ending`
 * once `ends_at` has passed (waiting for the server to finalize). Non-active: pending/closed.
 */
export const sessionPhase = (session: ExchangeSession, localNowMs: number, offsetMs: number): SessionPhase => {
  if (session.status === "pending") return "pending";
  if (session.status !== "active") return "closed";
  const now = localNowMs + offsetMs;
  const end = parseTime(session.ends_at);
  if (end !== null && now >= end) return "ending";
  const point = switchPointMs(session);
  return point !== null && now >= point ? "second" : "first";
};

/** The language to use right now (null unless active). Mirrors the server's current_language. */
export const currentLanguageAt = (session: ExchangeSession, localNowMs: number, offsetMs: number): string | null => {
  const phase = sessionPhase(session, localNowMs, offsetMs);
  if (phase === "first") return session.first_language;
  if (phase === "second" || phase === "ending") return session.second_language;
  return null;
};

/** "Switch now" is allowed while active, before the switch point (server: once, before halfway). */
export const canSwitchNow = (session: ExchangeSession, localNowMs: number, offsetMs: number) =>
  session.status === "active" && !session.switched_at && sessionPhase(session, localNowMs, offsetMs) === "first";

/** Elapsed share of an active session (0–1) and where the halfway marker sits. */
export const sessionProgress = (session: ExchangeSession, localNowMs: number, offsetMs: number) => {
  const start = parseTime(session.started_at);
  const end = parseTime(session.ends_at);
  if (start === null || end === null || end <= start) return { elapsed: 0, switchAt: 0.5 };
  const now = localNowMs + offsetMs;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const point = switchPointMs(session);
  return {
    elapsed: clamp((now - start) / (end - start)),
    switchAt: point === null ? 0.5 : clamp((point - start) / (end - start)),
  };
};

/** The local deadline after which the client should refetch (server finalizes lazily). */
export const nextDeadline = (session: ExchangeSession | null | undefined): string | null => {
  if (!session) return null;
  if (session.status === "pending") return session.expires_at;
  if (session.status === "active") return session.ends_at;
  return null;
};

/**
 * Whether an incoming session (socket or HTTP) should replace the current one: a newer id
 * always wins, an older id never does, and for the same id the status never goes back
 * (a late "pending" broadcast can't undo "active").
 */
export const shouldReplaceSession = (
  current: ExchangeSession | null | undefined,
  incoming: ExchangeSession | null | undefined
): boolean => {
  if (!incoming) return false;
  if (!current) return true;
  if (incoming.id !== current.id) return incoming.id > current.id;
  return STATUS_RANK[incoming.status] >= STATUS_RANK[current.status];
};

/** "english" → "English"; "brazilian portuguese" → "Brazilian Portuguese". */
export const languageLabel = (language: string | null | undefined): string =>
  String(language || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export type LanguageBalance = {
  language: string;
  minutes: number;
  share: number;
  messageCount: number;
  messages: Record<string, number>;
};

/** Per-language minutes with their share of the total (shares sum to 1; equal split if 0 min). */
export const languageBalance = (summary: ExchangeSessionSummary | null | undefined): LanguageBalance[] => {
  const rows = summary?.languages || [];
  const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row.minutes) || 0), 0);
  return rows.map((row) => {
    const minutes = Math.max(0, Number(row.minutes) || 0);
    return {
      language: row.language,
      minutes,
      share: total > 0 ? minutes / total : rows.length ? 1 / rows.length : 0,
      messageCount: Number(row.message_count) || 0,
      messages: row.messages || {},
    };
  });
};

/** Whole minutes for display ("12 min"); 0.4 → "<1 min". */
export const formatMinutes = (minutes: number): string => {
  if (minutes > 0 && minutes < 1) return "<1 min";
  return `${Math.round(minutes)} min`;
};
