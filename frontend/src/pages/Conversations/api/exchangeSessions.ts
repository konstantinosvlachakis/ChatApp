import api, { API_TIMEOUTS, type RequestOptions } from "../../../lib/api";

/** Guided exchange sessions in direct chats (backend `chatapp/session_views.py`). */
export type ExchangeSessionStatus = "pending" | "active" | "ended" | "declined" | "cancelled" | "expired";
export type ExchangeTopicSource = "ai" | "library" | "custom";
export type ExchangeAction = "accept" | "decline" | "cancel" | "switch" | "topic" | "end";

export type ExchangeTopic = { id: number | string; title: string; prompts: string[] };

export type ExchangeSessionSummary = {
  languages: { language: string; minutes: number; messages: Record<string, number>; message_count: number }[];
  total_minutes: number;
  corrections: { id: number; message_id: number; corrector_id: number }[];
  correction_count: number;
  corrections_truncated: boolean;
};

export type ExchangeSession = {
  id: number;
  conversation_id: number;
  status: ExchangeSessionStatus;
  created_by: { id: number; username: string };
  partner: { id: number; username: string };
  duration_minutes: number;
  first_language: string;
  second_language: string;
  current_language: string | null;
  topic: ExchangeTopic | null;
  topic_source: ExchangeTopicSource | null;
  created_at: string;
  expires_at: string | null;
  started_at: string | null;
  halfway_at: string | null;
  switched_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  ended_by_id: number | null;
  summary: ExchangeSessionSummary | null;
  server_time: string;
};

export type ConversationSessionState = {
  session: ExchangeSession | null;
  languages: string[];
  default_languages: string[];
  durations: number[];
};

export type StartExchangeSessionInput = {
  duration_minutes: number;
  first_language: string;
  second_language: string;
  topic?: string;
};

export const EXCHANGE_DURATIONS = [10, 20, 30];
export const EXCHANGE_DEFAULT_DURATION = 20;
export const EXCHANGE_TOPIC_MAX_LENGTH = 120;

/** GET the open (or recently ended) session of a direct chat. Not for groups (400 group_not_supported). */
export const fetchConversationSession = (conversationId: number | string, options?: RequestOptions) =>
  api.get<ConversationSessionState>(`/api/conversations/${conversationId}/session/`, options);

/** Invite the partner (201 {session}, pending). The server may prepare AI topics first (slow). */
export const startExchangeSession = (conversationId: number | string, input: StartExchangeSessionInput) =>
  api.post<{ session: ExchangeSession }>(`/api/conversations/${conversationId}/session/`, input, {
    timeoutMs: API_TIMEOUTS.coach,
  });

/** accept|decline|cancel|switch|topic|end. `topic` without a title = next suggestion (slow). */
export const runExchangeSessionAction = (
  sessionId: number,
  action: ExchangeAction,
  body?: { title?: string }
) =>
  api.post<{ session: ExchangeSession }>(`/api/exchange-sessions/${sessionId}/${action}/`, body || {}, {
    timeoutMs: action === "topic" || action === "accept" ? API_TIMEOUTS.coach : undefined,
  });
