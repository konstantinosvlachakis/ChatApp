/**
 * Normalised API error. Every failure from `lib/api` is an ApiError, built from the
 * backend envelope `{error, code, details?, request_id?, retry_after?}` (legacy
 * `message`/`detail` keys are still read) or from the transport failure.
 */
export type ApiErrorCode =
  | "network_error"
  | "timeout"
  | "aborted"
  | "unknown"
  | (string & {});

export type ApiErrorInit = {
  status: number;
  code: ApiErrorCode;
  message: string;
  requestId?: string | null;
  retryable?: boolean;
  details?: unknown;
  data?: unknown;
  retryAfterMs?: number | null;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly requestId: string | null;
  readonly retryable: boolean;
  readonly details: unknown;
  /** The raw parsed response body (e.g. translate's `already_translated` payload). */
  readonly data: unknown;
  readonly retryAfterMs: number | null;
  readonly isApiError = true;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId ?? null;
    this.retryable = Boolean(init.retryable);
    this.details = init.details;
    this.data = init.data;
    this.retryAfterMs = init.retryAfterMs ?? null;
  }
}

export const isApiError = (value: unknown): value is ApiError =>
  value instanceof ApiError || Boolean((value as { isApiError?: boolean } | null)?.isApiError);

export const isAbortError = (value: unknown) => isApiError(value) && value.code === "aborted";

/** Statuses worth retrying for idempotent requests. */
export const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

const FRIENDLY_MESSAGES: Record<number, string> = {
  400: "That request wasn't valid. Please check and try again.",
  401: "Your session has expired. Please log in again.",
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  405: "That action isn't supported.",
  408: "The request timed out. Please try again.",
  409: "That conflicts with a recent change. Please refresh and try again.",
  413: "That file is too large.",
  415: "That file type isn't supported.",
  429: "You're doing that too often. Please wait a moment and try again.",
  500: "Something went wrong on our side. Please try again.",
  502: "The service is temporarily unavailable. Please try again.",
  503: "The service is temporarily unavailable. Please try again.",
  504: "The server took too long to respond. Please try again.",
};

const DEFAULT_CODES: Record<number, string> = {
  400: "invalid",
  401: "not_authenticated",
  403: "permission_denied",
  404: "not_found",
  405: "method_not_allowed",
  413: "too_large",
  415: "unsupported_media_type",
  429: "throttled",
  500: "server_error",
  502: "upstream_error",
  503: "service_unavailable",
  504: "upstream_timeout",
};

export const friendlyMessageForStatus = (status: number) =>
  FRIENDLY_MESSAGES[status] ||
  (status >= 500
    ? FRIENDLY_MESSAGES[500]
    : "Something went wrong. Please try again.");

export const OFFLINE_MESSAGE = "You're offline. Check your connection and try again.";
export const NETWORK_MESSAGE = "Can't reach the server. Check your connection and try again.";
export const TIMEOUT_MESSAGE = "The request timed out. Please try again.";

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** Parse a Retry-After header (seconds or HTTP date) into milliseconds. */
export const parseRetryAfterMs = (value: unknown, now = Date.now()): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw) * 1000);
  const date = Date.parse(raw);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
};

type HeaderBag = Record<string, unknown> | { get?: (name: string) => unknown } | undefined | null;

const readHeader = (headers: HeaderBag, name: string): unknown => {
  if (!headers) return undefined;
  const getter = (headers as { get?: (name: string) => unknown }).get;
  if (typeof getter === "function") {
    const value = getter.call(headers, name);
    if (value !== undefined && value !== null) return value;
  }
  const bag = headers as Record<string, unknown>;
  return bag[name] ?? bag[name.toLowerCase()];
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Build an ApiError from an HTTP response status, body and headers. */
export const apiErrorFromResponse = (
  status: number,
  body: unknown,
  headers?: HeaderBag
): ApiError => {
  const envelope = asRecord(body);
  const pickString = (key: string) =>
    envelope && typeof envelope[key] === "string" && (envelope[key] as string).trim()
      ? (envelope[key] as string)
      : null;

  const message =
    pickString("error") || pickString("message") || pickString("detail") || friendlyMessageForStatus(status);
  const code = pickString("code") || DEFAULT_CODES[status] || (status >= 500 ? "server_error" : "error");
  const requestId =
    pickString("request_id") || (readHeader(headers, "x-request-id") as string | undefined) || null;
  const retryAfterMs =
    parseRetryAfterMs(readHeader(headers, "retry-after")) ??
    (envelope && typeof envelope.retry_after === "number" ? envelope.retry_after * 1000 : null);

  return new ApiError({
    status,
    code,
    message,
    requestId,
    retryable: RETRYABLE_STATUSES.has(status),
    details: envelope?.details,
    data: body,
    retryAfterMs,
  });
};

type AxiosLikeError = {
  isAxiosError?: boolean;
  code?: string;
  name?: string;
  message?: string;
  response?: { status: number; data?: unknown; headers?: HeaderBag };
};

/** Normalise anything thrown by axios/fetch (or already an ApiError) into an ApiError. */
export const toApiError = (error: unknown): ApiError => {
  if (isApiError(error)) return error;
  const err = (error || {}) as AxiosLikeError;

  if (err.code === "ERR_CANCELED" || err.name === "CanceledError" || err.name === "AbortError") {
    return new ApiError({ status: 0, code: "aborted", message: "The request was cancelled." });
  }
  if (err.response && typeof err.response.status === "number") {
    return apiErrorFromResponse(err.response.status, err.response.data, err.response.headers);
  }
  if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT" || err.name === "TimeoutError") {
    return new ApiError({ status: 0, code: "timeout", message: TIMEOUT_MESSAGE, retryable: true });
  }
  if (err.isAxiosError || err.code === "ERR_NETWORK" || error instanceof TypeError) {
    return new ApiError({
      status: 0,
      code: "network_error",
      message: isOffline() ? OFFLINE_MESSAGE : NETWORK_MESSAGE,
      retryable: true,
    });
  }
  return new ApiError({
    status: 0,
    code: "unknown",
    message: "Something went wrong. Please try again.",
    data: error,
  });
};

/** User-facing text for any error, with an optional fallback for non-API errors. */
export const getErrorMessage = (error: unknown, fallback?: string) => {
  if (isApiError(error)) return error.message;
  const normalised = toApiError(error);
  if (normalised.code === "unknown" && fallback) return fallback;
  return normalised.message || fallback || "Something went wrong. Please try again.";
};
