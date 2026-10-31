import { BASE_URL } from "../constants/constants";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/privacy-policy",
  "/terms-and-conditions",
]);
// Dynamic public routes (the emailed password reset link: /reset-password/<uid>/<token>).
const PUBLIC_PATH_PREFIXES = ["/reset-password/"];
const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";
// Must match CSRF_STORAGE_KEY in ./csrf (not imported to avoid a circular dependency).
const CSRF_STORAGE_KEY = "csrfToken";

export const shouldUseLegacyAuthFallback = () => {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
};

export const getLegacyAccessToken = () => {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(ACCESS_TOKEN_KEY) || "";
};

export const getLegacyRefreshToken = () => {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(REFRESH_TOKEN_KEY) || localStorage.getItem(REFRESH_TOKEN_KEY) || "";
};

export const setLegacyTokens = ({
  access,
  refresh,
  rememberMe = false,
}: {
  access?: string;
  refresh?: string;
  rememberMe?: boolean;
}) => {
  if (typeof window === "undefined") return;
  clearLegacyTokens();
  if (!access) return;

  sessionStorage.setItem(ACCESS_TOKEN_KEY, access);
  if (refresh) {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  }

  if (rememberMe) {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    if (refresh) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
    }
  }
};

export const clearLegacyTokens = () => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

// Per-user data cached in browser storage that must not survive a logout
// (shared/public devices). Keep in sync with UserContext / MessageInput.
const SESSION_STORAGE_PREFIXES_TO_CLEAR = ["chat:draft:"];
const SESSION_STORAGE_KEYS_TO_CLEAR = ["user_profile_cache:v1"];

/**
 * Clears every piece of client-side session state: legacy tokens, the cached CSRF
 * token (Django rotates it on login/logout), the cached profile and message drafts.
 */
export const clearClientSessionData = () => {
  if (typeof window === "undefined") return;
  clearLegacyTokens();
  sessionStorage.removeItem(CSRF_STORAGE_KEY);
  try {
    SESSION_STORAGE_KEYS_TO_CLEAR.forEach((key) => localStorage.removeItem(key));
    Object.keys(localStorage)
      .filter((key) => SESSION_STORAGE_PREFIXES_TO_CLEAR.some((prefix) => key.startsWith(prefix)))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage may be unavailable (private mode); nothing to clear.
  }
};

export const isPublicPath = (pathname: string) =>
  PUBLIC_PATHS.has(pathname) || PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

export const refreshSession = async () => {
  const refreshToken = shouldUseLegacyAuthFallback() ? getLegacyRefreshToken() : "";
  const response = await fetch(`${BASE_URL}/api/token/refresh/`, {
    method: "POST",
    credentials: "include",
    headers: refreshToken
      ? {
          "Content-Type": "application/json",
        }
      : undefined,
    body: refreshToken ? JSON.stringify({ refresh: refreshToken }) : undefined,
  });
  if (response.ok && shouldUseLegacyAuthFallback()) {
    const payload = await response.clone().json().catch(() => ({}));
    if (payload?.access || payload?.refresh) {
      setLegacyTokens({
        access: payload.access || getLegacyAccessToken(),
        refresh: payload.refresh || refreshToken,
      });
    }
  }
  return response.ok;
};

/** Dispatched on `window` after a successful refresh so stopped sockets can reconnect. */
export const SESSION_REFRESHED_EVENT = "session-refreshed";

// Endpoints whose 401s mean "bad credentials"/"no session", not "access token expired".
const AUTH_ENDPOINT_PATHS = new Set([
  "/api/token/",
  "/api/token/refresh/",
  "/api/logout/",
  "/api/register/",
  "/api/csrf/",
  "/api/auth/password-reset/",
  "/api/auth/password-reset/confirm/",
]);

export const isAuthEndpoint = (pathname: string) => AUTH_ENDPOINT_PATHS.has(pathname);

let refreshInFlight: Promise<boolean> | null = null;

/** Single-flight session refresh shared by fetch, axios and the websockets. */
export const refreshSessionOnce = (): Promise<boolean> => {
  if (!refreshInFlight) {
    refreshInFlight = refreshSession()
      .catch(() => false)
      .then((refreshed) => {
        if (refreshed && typeof window !== "undefined") {
          window.dispatchEvent(new Event(SESSION_REFRESHED_EVENT));
        }
        return refreshed;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

/** The refresh token is gone too: drop client state and leave protected pages. */
export const handleSessionExpired = () => {
  if (typeof window === "undefined") return;
  clearClientSessionData();
  if (!isPublicPath(window.location.pathname) && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
};
