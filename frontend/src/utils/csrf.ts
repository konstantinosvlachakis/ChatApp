import axios, {
  AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import { BASE_URL } from "../constants/constants";
import {
  getLegacyAccessToken,
  handleSessionExpired,
  isAuthEndpoint,
  refreshSessionOnce,
} from "./auth";

const CSRF_STORAGE_KEY = "csrfToken";

let initialized = false;
let csrfPromise: Promise<string> | null = null;
let nativeFetchRef: typeof window.fetch | null = null;

const isBrowser = typeof window !== "undefined";

const getBaseOrigin = () => {
  if (!isBrowser) return "";
  return new URL(BASE_URL, window.location.origin).origin;
};

const isUnsafeMethod = (method = "GET") =>
  !["GET", "HEAD", "OPTIONS", "TRACE"].includes(String(method).toUpperCase());

const toUrl = (input: string | Request | URL, baseURL?: string) => {
  if (!isBrowser) return null;

  try {
    if (typeof input === "string") {
      return new URL(input, baseURL || window.location.origin);
    }
    if (input instanceof URL) {
      return input;
    }
    if (input instanceof Request) {
      return new URL(input.url, window.location.origin);
    }
  } catch {
    return null;
  }

  return null;
};

const isBackendRequest = (input: string | Request | URL, baseURL?: string) => {
  const url = toUrl(input, baseURL);
  if (!url) return false;
  return url.origin === getBaseOrigin();
};

export const getStoredCsrfToken = () => {
  if (!isBrowser) return "";
  return sessionStorage.getItem(CSRF_STORAGE_KEY) || "";
};

const storeCsrfToken = (token: string) => {
  if (!isBrowser || !token) return;
  sessionStorage.setItem(CSRF_STORAGE_KEY, token);
};

export const ensureCsrfToken = async (): Promise<string> => {
  if (!isBrowser) return "";

  const existingToken = getStoredCsrfToken();
  if (existingToken) return existingToken;

  if (csrfPromise) return csrfPromise;
  if (!nativeFetchRef) nativeFetchRef = window.fetch.bind(window);

  csrfPromise = nativeFetchRef(`${BASE_URL}/api/csrf/`, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to initialise CSRF protection (${response.status})`);
      }
      const data = (await response.json()) as { csrfToken?: string };
      const token = String(data?.csrfToken || "").trim();
      if (!token) {
        throw new Error("CSRF token missing from response");
      }
      storeCsrfToken(token);
      return token;
    })
    .finally(() => {
      csrfPromise = null;
    });

  return csrfPromise;
};

const attachCsrfHeader = async (headers: HeadersInit | undefined, method?: string) => {
  if (!isUnsafeMethod(method)) return new Headers(headers);

  const nextHeaders = new Headers(headers);
  const token = getStoredCsrfToken() || (await ensureCsrfToken());
  nextHeaders.set("X-CSRFToken", token);
  return nextHeaders;
};

const attachCsrfToAxiosConfig = async (config: InternalAxiosRequestConfig) => {
  if (!isBackendRequest(config.url || "", config.baseURL || BASE_URL)) {
    return config;
  }

  config.withCredentials = true;
  const headers = AxiosHeaders.from(config.headers);
  const legacyAccessToken = getLegacyAccessToken();
  if (legacyAccessToken) {
    headers.set("Authorization", `Bearer ${legacyAccessToken}`);
  }
  if (!isUnsafeMethod(config.method)) {
    config.headers = headers;
    return config;
  }

  const token = getStoredCsrfToken() || (await ensureCsrfToken());
  headers.set("X-CSRFToken", token);
  config.headers = headers;
  return config;
};

type SessionRetryConfig = InternalAxiosRequestConfig & { _sessionRetry?: boolean };

/**
 * On a 401 from the backend, refresh the session once (single-flight) and replay the
 * request; if the refresh fails, clear session data and leave protected pages.
 */
export const installSessionRefreshInterceptor = (instance: AxiosInstance) => {
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error?.config as SessionRetryConfig | undefined;
      if (!config || error?.response?.status !== 401 || config._sessionRetry) {
        throw error;
      }
      const baseURL = config.baseURL || BASE_URL;
      const url = toUrl(config.url || "", baseURL);
      if (!url || !isBackendRequest(url, baseURL) || isAuthEndpoint(url.pathname)) {
        throw error;
      }
      config._sessionRetry = true;
      if (!(await refreshSessionOnce())) {
        handleSessionExpired();
        throw error;
      }
      return instance(config);
    }
  );
};

export const initCsrfProtection = async () => {
  if (!isBrowser) return;
  if (!nativeFetchRef) nativeFetchRef = window.fetch.bind(window);

  if (!initialized) {
    axios.defaults.withCredentials = true;
    axios.interceptors.request.use(attachCsrfToAxiosConfig);
    installSessionRefreshInterceptor(axios);

    window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const request = input instanceof Request ? input : null;
      const requestUrl = input instanceof URL ? input : request || String(input);

      if (!isBackendRequest(requestUrl, BASE_URL)) {
        return nativeFetchRef!(input, init);
      }

      const method = init.method || request?.method || "GET";
      const send = async (target: RequestInfo | URL) => {
        const headers = await attachCsrfHeader(init.headers || request?.headers, method);
        const legacyAccessToken = getLegacyAccessToken();
        if (legacyAccessToken) {
          headers.set("Authorization", `Bearer ${legacyAccessToken}`);
        }
        return nativeFetchRef!(target, {
          ...init,
          credentials: init.credentials || "include",
          headers,
        });
      };

      const pathname = toUrl(requestUrl, BASE_URL)?.pathname || "";
      if (isAuthEndpoint(pathname)) {
        return send(input);
      }

      // A Request body can only be read once; keep the original for the retry.
      const response = await send(request ? request.clone() : input);
      if (response.status !== 401) {
        return response;
      }
      if (!(await refreshSessionOnce())) {
        handleSessionExpired();
        return response;
      }
      return send(input);
    };

    initialized = true;
  }

  await ensureCsrfToken();
};
