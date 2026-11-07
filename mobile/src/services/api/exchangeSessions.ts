import { api, COACH_TIMEOUT_MS } from "./client";
import { toApiError } from "./errors";
import type { ConversationSessionInfo, ExchangeSession, ExchangeSessionAction } from "../../types";

/**
 * Guided exchange sessions (one-to-one chats only; groups answer 400 `group_not_supported`).
 * Starting a session and asking for another topic may wait on Lumi (Gemini), so those calls get
 * the coach timeout.
 */

/** The open session (or one that ended < 1 h ago), the language choices and durations. */
export async function fetchConversationSession(
  conversationId: number,
  signal?: AbortSignal
): Promise<ConversationSessionInfo> {
  const response = await api.get<ConversationSessionInfo>(`/conversations/${conversationId}/session/`, { signal });
  const data = response.data;
  return {
    session: data?.session ?? null,
    languages: Array.isArray(data?.languages) ? data.languages : [],
    default_languages: Array.isArray(data?.default_languages) ? data.default_languages : [],
    durations: Array.isArray(data?.durations) && data.durations.length ? data.durations : [10, 20, 30],
  };
}

export type StartExchangeSessionInput = {
  durationMinutes: number;
  firstLanguage: string;
  secondLanguage: string;
  /** Custom topic title; empty = Lumi/library topics. */
  topic?: string;
};

/** Invites the partner (201 pending session). 409 `session_exists` carries the open session. */
export async function startExchangeSession(
  conversationId: number,
  input: StartExchangeSessionInput
): Promise<ExchangeSession> {
  const body: Record<string, unknown> = {
    duration_minutes: input.durationMinutes,
    first_language: input.firstLanguage,
    second_language: input.secondLanguage,
  };
  if (input.topic?.trim()) body.topic = input.topic.trim();
  const response = await api.post<{ session: ExchangeSession }>(`/conversations/${conversationId}/session/`, body, {
    timeout: COACH_TIMEOUT_MS,
  });
  return response.data.session;
}

/**
 * accept/decline (partner, pending), cancel (starter, pending), switch (active, once, before
 * halfway), topic (active; `{title}` or empty = next suggestion), end (active).
 */
export async function runExchangeSessionAction(
  sessionId: number,
  action: ExchangeSessionAction,
  body: { title?: string } = {}
): Promise<ExchangeSession> {
  const payload: Record<string, unknown> = {};
  if (action === "topic" && body.title?.trim()) payload.title = body.title.trim();
  const response = await api.post<{ session: ExchangeSession }>(
    `/exchange-sessions/${sessionId}/${action}/`,
    payload,
    action === "topic" || action === "accept" ? { timeout: COACH_TIMEOUT_MS } : undefined
  );
  return response.data.session;
}

/** The open session from a 409 `session_exists` body, else null. */
export function sessionFromConflict(error: unknown): ExchangeSession | null {
  const apiError = toApiError(error);
  if (apiError.code !== "session_exists") return null;
  const data = apiError.data as { session?: ExchangeSession } | null | undefined;
  return data?.session && typeof data.session.id === "number" ? data.session : null;
}
