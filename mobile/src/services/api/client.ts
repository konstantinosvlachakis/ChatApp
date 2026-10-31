import axios, { type InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "../../config/api";
import { reportApiFailure, reportApiSuccess } from "../connectivity";
import { isEmailUnverifiedError, publishEmailUnverified } from "../emailVerification";
import { captureError } from "../monitoring";
import { tokenStorage } from "../storage";
import { ApiError, toApiError } from "./errors";

export { ApiError, getErrorMessage, toApiError } from "./errors";

/** Default per-request timeout; pass `{ timeout }` per call for slow endpoints. */
export const DEFAULT_TIMEOUT_MS = 15_000;
export const COACH_TIMEOUT_MS = 35_000; // server deadline is 25 s (Heroku cuts at 30 s)
export const UPLOAD_TIMEOUT_MS = 60_000;

/** GET/HEAD retries: total attempts, backoff base/cap, and the longest Retry-After we wait. */
export const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;
const RETRY_MAX_DELAY_MS = 5_000;
const MAX_RETRY_AFTER_SECONDS = 30;

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: DEFAULT_TIMEOUT_MS,
});

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean; // 401 refresh already attempted
  _attempt?: number; // 1-based attempt number for GET/HEAD retries
};

let refreshPromise: Promise<string | null> | null = null;

// Single-flight; also used by sockets closed with 4401/4403 (expired or revoked token).
// Refresh tokens rotate: every success returns a new refresh token (the old one is
// blacklisted), so it must be stored. A failure (401: expired, revoked or already
// rotated) clears the session, which logs the user out.
export const refreshAccessToken = async () => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refresh = await tokenStorage.getRefreshToken();
      if (!refresh) {
        await tokenStorage.clear();
        return null;
      }

      try {
        const response = await axios.post(
          `${API_BASE_URL}/api/token/refresh/`,
          { refresh },
          {
            timeout: DEFAULT_TIMEOUT_MS,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
        const nextAccess = response.data?.access;
        const nextRefresh = response.data?.refresh;

        if (!nextAccess) {
          await tokenStorage.clear();
          return null;
        }

        await tokenStorage.setAccessToken(nextAccess);
        if (nextRefresh) {
          await tokenStorage.setRefreshToken(nextRefresh);
        }
        return nextAccess as string;
      } catch {
        // An email change may have stored a fresh pair while this refresh was in
        // flight with the old token: keep that session instead of logging out.
        const current = await tokenStorage.getRefreshToken();
        if (current && current !== refresh) {
          return tokenStorage.getAccessToken();
        }
        await tokenStorage.clear();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
};

/** Exponential backoff with full jitter, or the server's Retry-After. */
export function getRetryDelayMs(attempt: number, retryAfterSeconds: number | null) {
  if (retryAfterSeconds != null) return Math.ceil(retryAfterSeconds * 1000);
  const ceiling = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
}

/** Resolves after `ms`, or rejects with an "aborted" ApiError if the signal fires. */
export function sleep(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    const abortError = () =>
      new ApiError({ status: 0, code: "aborted", message: "The request was cancelled." });
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener?.("abort", onAbort);
  });
}

/** Only idempotent reads are retried, and only for transient failures. */
export function shouldRetry(method: string | undefined, error: ApiError, attempt: number) {
  const verb = String(method || "get").toUpperCase();
  if (verb !== "GET" && verb !== "HEAD") return false;
  if (attempt >= MAX_ATTEMPTS || !error.retryable) return false;
  if (error.retryAfterSeconds != null && error.retryAfterSeconds > MAX_RETRY_AFTER_SECONDS) {
    return false;
  }
  return true;
}

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await tokenStorage.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const hasContentType =
    Boolean(config.headers?.["Content-Type"]) || Boolean(config.headers?.["content-type"]);
  if (!hasContentType && !(config.data instanceof FormData)) {
    config.headers["Content-Type"] = "application/json";
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    reportApiSuccess();
    return response;
  },
  async (error) => {
    // Already normalised by a nested (replayed) request.
    if (error instanceof ApiError) throw error;

    const originalRequest = error?.config as RetryableRequestConfig | undefined;
    const status = error?.response?.status;

    // 401: refresh the access token once (single-flight) and replay the request.
    if (
      originalRequest &&
      status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/token/refresh/")
    ) {
      originalRequest._retry = true;
      const nextAccessToken = await refreshAccessToken();
      if (nextAccessToken) {
        originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
        return api(originalRequest);
      }
    }

    const apiError = toApiError(error);
    if (apiError.isNetworkError) {
      reportApiFailure("network");
    } else if (apiError.status >= 502 && apiError.status <= 504) {
      reportApiFailure("server");
    } else if (apiError.status > 0) {
      reportApiSuccess();
    }

    if (originalRequest && !apiError.isAborted) {
      const attempt = originalRequest._attempt || 1;
      if (shouldRetry(originalRequest.method, apiError, attempt)) {
        originalRequest._attempt = attempt + 1;
        await sleep(
          getRetryDelayMs(attempt, apiError.retryAfterSeconds),
          originalRequest.signal as AbortSignal | undefined
        );
        return api(originalRequest);
      }
    }

    if (apiError.status >= 500) {
      captureError(apiError);
    }
    // Gated action by an unverified account: one central prompt (AppTabs) instead of
    // per-screen error toasts (toastApiError skips this code).
    if (isEmailUnverifiedError(apiError)) {
      publishEmailUnverified(apiError.message);
    }
    throw apiError;
  }
);
