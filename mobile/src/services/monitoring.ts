import * as Sentry from "@sentry/react-native";
import type { Breadcrumb, ErrorEvent } from "@sentry/react-native";

/**
 * Optional crash/error reporting. Initialised only when EXPO_PUBLIC_SENTRY_DSN is
 * set at build time; otherwise every export here is a no-op. No PII: no default
 * PII, auth/cookie headers and request bodies removed, emails redacted.
 */
const DSN = (process.env.EXPO_PUBLIC_SENTRY_DSN || "").trim();
const FILTERED = "[Filtered]";
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-csrftoken",
  "proxy-authorization",
]);

let enabled = false;

export function isMonitoringEnabled() {
  return enabled;
}

function scrubText<T>(value: T): T {
  return (typeof value === "string" ? value.replace(EMAIL_PATTERN, FILTERED) : value) as T;
}

function scrubHeaders(headers: Record<string, string> | undefined) {
  if (!headers) return headers;
  const next: Record<string, string> = {};
  Object.entries(headers).forEach(([key, value]) => {
    next[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? FILTERED : value;
  });
  return next;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    event.request.headers = scrubHeaders(event.request.headers);
    if (typeof event.request.query_string === "string") {
      event.request.query_string = scrubText(event.request.query_string);
    }
  }
  if (event.user) {
    event.user = event.user.id != null ? { id: event.user.id } : {};
  }
  if (event.message) event.message = scrubText(event.message);
  event.exception?.values?.forEach((exception) => {
    if (exception.value) exception.value = scrubText(exception.value);
  });
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb).filter(Boolean) as Breadcrumb[];
  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // Console output can contain chat text or profile data.
  if (breadcrumb.category === "console") return null;
  const next: Breadcrumb = { ...breadcrumb };
  if (next.message) next.message = scrubText(next.message);
  if (next.data) {
    const { url, method, status_code } = next.data as Record<string, unknown>;
    // Keep only what identifies the request, never bodies or headers.
    next.data = {
      ...(typeof url === "string" ? { url: scrubText(url.split("?")[0]) } : {}),
      ...(method ? { method } : {}),
      ...(status_code ? { status_code } : {}),
    };
  }
  return next;
}

function sampleRate(raw: string | undefined) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

export function initMonitoring() {
  if (!DSN || enabled) return enabled;
  Sentry.init({
    dsn: DSN,
    sendDefaultPii: false,
    tracesSampleRate: sampleRate(process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE),
    environment: __DEV__ ? "development" : "production",
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
  enabled = true;
  return true;
}

/** Report an unexpected error; ApiErrors are tagged with request_id/code/status. */
export function captureError(error: unknown) {
  if (!enabled) return;
  const apiError = error as { name?: string; requestId?: string | null; code?: string; status?: number };
  if (apiError?.name === "ApiError") {
    Sentry.withScope((scope) => {
      if (apiError.requestId) scope.setTag("request_id", apiError.requestId);
      if (apiError.code) scope.setTag("api_code", apiError.code);
      if (apiError.status != null) scope.setTag("http_status", String(apiError.status));
      Sentry.captureException(error);
    });
    return;
  }
  Sentry.captureException(error);
}

/** Wrap the root component (error boundary + touch breadcrumbs) only when enabled. */
export function wrapRoot<P extends Record<string, unknown>>(Root: React.ComponentType<P>) {
  return enabled ? Sentry.wrap(Root) : Root;
}
