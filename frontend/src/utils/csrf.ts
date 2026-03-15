import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { BASE_URL } from "../constants/constants";
import { getLegacyAccessToken } from "./auth";

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

export const initCsrfProtection = async () => {
  if (!isBrowser) return;
  if (!nativeFetchRef) nativeFetchRef = window.fetch.bind(window);

  if (!initialized) {
    axios.defaults.withCredentials = true;
    axios.interceptors.request.use(attachCsrfToAxiosConfig);

    window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const request = input instanceof Request ? input : null;
      const requestUrl = input instanceof URL ? input : request || String(input);

      if (!isBackendRequest(requestUrl, BASE_URL)) {
        return nativeFetchRef!(input, init);
      }

      const method = init.method || request?.method || "GET";
      const headers = await attachCsrfHeader(init.headers || request?.headers, method);
      const legacyAccessToken = getLegacyAccessToken();
      if (legacyAccessToken) {
        headers.set("Authorization", `Bearer ${legacyAccessToken}`);
      }

      return nativeFetchRef!(input, {
        ...init,
        credentials: init.credentials || "include",
        headers,
      });
    };

    initialized = true;
  }

  await ensureCsrfToken();
};
