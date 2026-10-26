import { isApiError } from "./apiError";

/**
 * Optional Sentry error reporting, enabled only when REACT_APP_SENTRY_DSN is set.
 * The SDK is loaded with a dynamic import after first paint (scheduleSentryInit), so it
 * never adds to the main bundle; errors captured before it loads are sent once it does.
 */
type SentryModule = typeof import("./sentrySdk");
type CaptureContext = Record<string, unknown> | undefined;

const DSN = (process.env.REACT_APP_SENTRY_DSN || "").trim();
const FILTERED = "[Filtered]";
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "set-cookie", "x-csrftoken"]);

let sentryPromise: Promise<SentryModule | null> | null = null;

export const isSentryEnabled = () => Boolean(DSN);

const tracesSampleRate = () => {
  const value = Number(process.env.REACT_APP_SENTRY_TRACES_SAMPLE_RATE || 0);
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
};

const scrubText = (value: unknown) =>
  typeof value === "string" ? value.replace(EMAIL_PATTERN, FILTERED) : value;

/** Strip query strings and usernames from URLs (`/profile/public/<name>/`). */
export const scrubUrl = (value: unknown) => {
  if (typeof value !== "string") return value;
  const [withoutQuery] = value.split("?");
  return String(scrubText(withoutQuery)).replace(/(\/(?:profile\/public|people)\/)[^/]+/g, "$1:username");
};

// Sentry's event/breadcrumb types are wide; scrub them structurally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const scrubEvent = (event: any) => {
  if (!event || typeof event !== "object") return event;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
    delete event.request.query_string;
    if (event.request.headers) {
      Object.keys(event.request.headers).forEach((key) => {
        if (SENSITIVE_HEADERS.has(key.toLowerCase())) event.request.headers[key] = FILTERED;
      });
    }
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {};
  if (event.message) event.message = scrubText(event.message);
  (event.exception?.values || []).forEach((exception: { value?: unknown }) => {
    if (exception && "value" in exception) exception.value = scrubText(exception.value);
  });
  (event.breadcrumbs || []).forEach((crumb: Record<string, unknown>) => scrubBreadcrumb(crumb));
  return event;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const scrubBreadcrumb = (crumb: any) => {
  if (!crumb) return crumb;
  // Console output may contain user data; drop it entirely.
  if (crumb.category === "console") return null;
  if (crumb.message) crumb.message = scrubText(crumb.message);
  if (crumb.data) {
    const { url, method, status_code: statusCode } = crumb.data;
    crumb.data = {
      ...(url ? { url: scrubUrl(url) } : {}),
      ...(method ? { method } : {}),
      ...(statusCode ? { status_code: statusCode } : {}),
    };
  }
  return crumb;
};

export const initSentry = (): Promise<SentryModule | null> => {
  if (!DSN) return Promise.resolve(null);
  if (!sentryPromise) {
    sentryPromise = import("./sentrySdk")
      .then((Sentry) => {
        const rate = tracesSampleRate();
        Sentry.init({
          dsn: DSN,
          environment: process.env.REACT_APP_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
          release: process.env.REACT_APP_SENTRY_RELEASE || undefined,
          // SDK v11 replaced `sendDefaultPii` with per-category `dataCollection`; collect no
          // user info, cookies, headers, bodies or query params (the equivalent of
          // sendDefaultPii: false, plus no bodies/headers at all).
          dataCollection: {
            userInfo: false,
            cookies: false,
            httpHeaders: false,
            httpBodies: [],
            urlQueryParams: false,
            stackFrameVariables: false,
          },
          tracesSampleRate: rate,
          integrations: rate > 0 ? [Sentry.browserTracingIntegration()] : [],
          beforeSend: (event) => scrubEvent(event),
          beforeSendTransaction: (event) => scrubEvent(event),
          beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
        });
        return Sentry;
      })
      .catch(() => null);
  }
  return sentryPromise;
};

/** Load Sentry once the page is idle (after first paint). */
export const scheduleSentryInit = () => {
  if (!DSN || typeof window === "undefined") return;
  const start = () => {
    void initSentry();
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
    .requestIdleCallback;
  if (idle) idle(start, { timeout: 5000 });
  else window.setTimeout(start, 2000);
};

/** Whether an error is worth reporting (server bugs and client crashes, not 4xx/offline). */
export const shouldReport = (error: unknown) => {
  if (!isApiError(error)) return true;
  if (error.code === "aborted" || error.code === "network_error" || error.code === "timeout") {
    return false;
  }
  return error.status >= 500 || error.code === "unknown";
};

export const captureException = (error: unknown, context?: CaptureContext) => {
  if (!DSN || !shouldReport(error)) return;
  void initSentry().then((Sentry) => {
    if (!Sentry) return;
    Sentry.withScope((scope) => {
      if (isApiError(error)) {
        if (error.requestId) scope.setTag("request_id", error.requestId);
        scope.setTag("api_code", String(error.code));
        scope.setTag("http_status", String(error.status));
      }
      if (context) scope.setContext("details", context);
      Sentry.captureException(error);
    });
  });
};
