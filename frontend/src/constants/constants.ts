
const isProduction = process.env.NODE_ENV === "production";

// REACT_APP_BASE_URL (if set) overrides the default API origin. In production the
// default is "" (same origin as the SPA); in development it is the local Django server.
const envBaseUrl = (process.env.REACT_APP_BASE_URL || "").trim().replace(/\/+$/, "");

export const BASE_URL: string = envBaseUrl || (isProduction
  ? ""
  : "http://127.0.0.1:8000");

export const BASE_URL_IMG =`${BASE_URL}`

/**
 * Websocket origin for the API. Always uses wss:// when the API (or the page itself)
 * is served over https, so production sockets are never downgraded to plain ws://.
 */
export const getWebSocketBaseUrl = (): string => {
  if (typeof window === "undefined") return "";
  const apiUrl = new URL(BASE_URL || window.location.origin, window.location.origin);
  const isSecure = apiUrl.protocol === "https:" || window.location.protocol === "https:";
  return `${isSecure ? "wss:" : "ws:"}//${apiUrl.host}`;
};
