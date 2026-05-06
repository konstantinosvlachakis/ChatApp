import { BASE_URL } from "../constants/constants";

const PUBLIC_PATHS = new Set(["/", "/login", "/register", "/privacy-policy", "/terms-and-conditions"]);
const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";

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

export const isPublicPath = (pathname: string) => PUBLIC_PATHS.has(pathname);

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
