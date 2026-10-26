import { ApiError, toApiError } from "./apiError";
import { reportApiFailure, reportApiSuccess } from "./connectivity";

/**
 * Transport-agnostic core of the API client: timeouts, retry policy and error
 * normalisation. `lib/api.ts` wires it to the app's axios instance (CSRF + 401 refresh).
 */
export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export type RequestOptions = {
  params?: QueryParams;
  headers?: Record<string, string>;
  /** Cancels the request (and any pending retry wait). */
  signal?: AbortSignal;
  /** Per-attempt timeout in ms (default 15 s). */
  timeoutMs?: number;
  /** Max attempts for GET/HEAD (default 3). Ignored for other methods (always 1). */
  maxAttempts?: number;
  onUploadProgress?: (event: { loaded: number; total?: number }) => void;
};

export type HttpRequestConfig = {
  method: HttpMethod;
  url: string;
  data?: unknown;
  params?: QueryParams;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeout: number;
  onUploadProgress?: RequestOptions["onUploadProgress"];
};

export type HttpTransport = (config: HttpRequestConfig) => Promise<{ data: unknown }>;

export const API_TIMEOUTS = {
  default: 15_000,
  upload: 60_000,
  // The coach view has a 25 s upstream deadline (Heroku cuts requests at 30 s).
  coach: 35_000,
} as const;

export const DEFAULT_MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 5_000;
/** Don't hold a request open for a server asking us to wait longer than this. */
export const MAX_RETRY_AFTER_MS = 10_000;

const IDEMPOTENT_METHODS = new Set<HttpMethod>(["GET", "HEAD"]);

export const isIdempotent = (method: HttpMethod) => IDEMPOTENT_METHODS.has(method);

/**
 * Delay before the next attempt, or null when the error must not be retried.
 * Exponential backoff with jitter (50–100% of base·2^(attempt-1), capped), or the
 * server's Retry-After when it sent one.
 */
export const getRetryDelayMs = (
  attempt: number,
  error: ApiError,
  random: () => number = Math.random
): number | null => {
  if (!error.retryable) return null;
  if (error.retryAfterMs !== null && error.retryAfterMs !== undefined) {
    return error.retryAfterMs > MAX_RETRY_AFTER_MS ? null : error.retryAfterMs;
  }
  const exponential = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
  return Math.round(exponential / 2 + random() * (exponential / 2));
};

export const abortError = () =>
  new ApiError({ status: 0, code: "aborted", message: "The request was cancelled." });

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export type ApiClientDeps = {
  transport: HttpTransport;
  buildUrl?: (path: string) => string;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  onError?: (error: ApiError) => void;
};

export const createApiClient = ({
  transport,
  buildUrl = (path) => path,
  sleep: wait = sleep,
  random = Math.random,
  onError,
}: ApiClientDeps) => {
  const request = async <T = unknown>(
    method: HttpMethod,
    path: string,
    data?: unknown,
    options: RequestOptions = {}
  ): Promise<T> => {
    const { signal, timeoutMs = API_TIMEOUTS.default, maxAttempts, ...rest } = options;
    const attempts = isIdempotent(method) ? Math.max(1, maxAttempts ?? DEFAULT_MAX_ATTEMPTS) : 1;
    const url = buildUrl(path);

    for (let attempt = 1; ; attempt += 1) {
      if (signal?.aborted) throw abortError();
      try {
        const response = await transport({
          method,
          url,
          data,
          params: rest.params,
          headers: rest.headers,
          signal,
          timeout: timeoutMs,
          onUploadProgress: rest.onUploadProgress,
        });
        reportApiSuccess();
        return response.data as T;
      } catch (raw) {
        const error = signal?.aborted ? abortError() : toApiError(raw);
        reportApiFailure(error);
        const delay = attempt < attempts ? getRetryDelayMs(attempt, error, random) : null;
        if (delay === null) {
          onError?.(error);
          throw error;
        }
        await wait(delay, signal);
      }
    }
  };

  return {
    request,
    get: <T = unknown>(path: string, options?: RequestOptions) =>
      request<T>("GET", path, undefined, options),
    post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>("POST", path, body, options),
    put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>("PUT", path, body, options),
    patch: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>("PATCH", path, body, options),
    delete: <T = unknown>(path: string, options?: RequestOptions) =>
      request<T>("DELETE", path, undefined, options),
    /** Multipart upload (FormData); longer default timeout, never retried. */
    upload: <T = unknown>(
      path: string,
      form: FormData,
      options: RequestOptions & { method?: "POST" | "PATCH" | "PUT" } = {}
    ) => {
      const { method = "POST", ...rest } = options;
      return request<T>(method, path, form, { timeoutMs: API_TIMEOUTS.upload, ...rest });
    },
  };
};

export type ApiClient = ReturnType<typeof createApiClient>;
