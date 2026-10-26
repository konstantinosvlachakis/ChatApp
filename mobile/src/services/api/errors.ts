import axios from "axios";

/**
 * Normalised API failure. The backend sends `{error, code, details?, request_id?,
 * retry_after?}` for every error (older builds also read `message`/`detail`, which
 * the backend still includes on token and coach errors for one release).
 */
export class ApiError extends Error {
  readonly status: number; // 0 when no HTTP response was received
  readonly code: string; // backend `code`, or network_error / timeout / aborted / unknown
  readonly requestId: string | null;
  readonly retryable: boolean;
  readonly details: unknown;
  /** Raw response body (e.g. translate's 400 `already_translated` payload). */
  readonly data: unknown;
  /** Seconds from `Retry-After` / `retry_after`, when the server sent one. */
  readonly retryAfterSeconds: number | null;
  /** Kept so existing `error?.response?.data?.x` reads keep working. */
  readonly response?: { status: number; data: unknown };

  constructor(init: {
    status: number;
    code: string;
    message: string;
    requestId?: string | null;
    retryable?: boolean;
    details?: unknown;
    data?: unknown;
    retryAfterSeconds?: number | null;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId ?? null;
    this.retryable = Boolean(init.retryable);
    this.details = init.details;
    this.data = init.data;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
    if (init.status > 0) {
      this.response = { status: init.status, data: init.data };
    }
  }

  get isNetworkError() {
    return this.code === "network_error" || this.code === "timeout";
  }

  get isAborted() {
    return this.code === "aborted";
  }
}

export const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

const FRIENDLY_MESSAGES: Record<number, string> = {
  400: "That request wasn't valid. Please check and try again.",
  401: "Your session has expired. Please log in again.",
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  405: "That action isn't supported.",
  409: "That conflicts with a recent change. Please refresh and try again.",
  413: "That file is too large.",
  415: "That file type isn't supported.",
  429: "You're doing that too often. Please wait a moment and try again.",
  500: "Something went wrong on our side. Please try again.",
  502: "The server is having trouble. Please try again shortly.",
  503: "The service is temporarily unavailable. Please try again shortly.",
  504: "The server took too long to respond. Please try again.",
};

export function friendlyMessageForStatus(status: number) {
  if (FRIENDLY_MESSAGES[status]) return FRIENDLY_MESSAGES[status];
  if (status >= 500) return FRIENDLY_MESSAGES[500];
  return "Something went wrong. Please try again.";
}

const DEFAULT_CODES: Record<number, string> = {
  400: "invalid",
  401: "not_authenticated",
  403: "permission_denied",
  404: "not_found",
  405: "method_not_allowed",
  429: "throttled",
  500: "server_error",
  502: "upstream_error",
  503: "service_unavailable",
  504: "upstream_timeout",
};

function headerValue(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== "object") return null;
  const record = headers as Record<string, unknown> & { get?: (key: string) => unknown };
  const value =
    (typeof record.get === "function" ? record.get(name) : undefined) ??
    record[name] ??
    record[name.toLowerCase()];
  return value == null ? null : String(value);
}

/** Seconds to wait from a Retry-After header (delta-seconds or HTTP date). */
export function parseRetryAfter(value: unknown): number | null {
  if (value == null || value === "") return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(String(value));
  if (Number.isNaN(date)) return null;
  return Math.max(0, (date - Date.now()) / 1000);
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Convert anything thrown by axios (or elsewhere) into an ApiError. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isCancel(error) || (error as { code?: string })?.code === "ERR_CANCELED") {
    return new ApiError({ status: 0, code: "aborted", message: "The request was cancelled." });
  }

  if (axios.isAxiosError(error)) {
    const response = error.response;
    if (!response) {
      const isTimeout =
        error.code === "ECONNABORTED" ||
        error.code === "ETIMEDOUT" ||
        /timeout/i.test(error.message || "");
      return new ApiError({
        status: 0,
        code: isTimeout ? "timeout" : "network_error",
        message: isTimeout
          ? "The request timed out. Please try again."
          : "Can't reach LangVoyage. Check your connection and try again.",
        retryable: true,
      });
    }

    const status = response.status;
    const body = response.data;
    const envelope =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null;
    const message =
      pickString(envelope?.error, envelope?.message, envelope?.detail) ||
      friendlyMessageForStatus(status);
    const retryAfterSeconds =
      parseRetryAfter(headerValue(response.headers, "retry-after")) ??
      parseRetryAfter(envelope?.retry_after);
    return new ApiError({
      status,
      code: pickString(envelope?.code) || DEFAULT_CODES[status] || (status >= 500 ? "server_error" : "error"),
      message,
      requestId:
        pickString(envelope?.request_id) || headerValue(response.headers, "x-request-id"),
      retryable: RETRYABLE_STATUSES.has(status),
      details: envelope?.details,
      data: body,
      retryAfterSeconds,
    });
  }

  const message = error instanceof Error && error.message ? error.message : "Something went wrong.";
  return new ApiError({ status: 0, code: "unknown", message });
}

/** User-facing text for a failure, with a fallback for non-API errors. */
export function getErrorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  const apiError = toApiError(error);
  if (apiError.code === "unknown") return fallback;
  return apiError.message || fallback;
}
