import axios, { type InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "../../config/api";
import { tokenStorage } from "../storage";

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 15000,
});

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

let refreshPromise: Promise<string | null> | null = null;

const refreshAccessToken = async () => {
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
            timeout: 15000,
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
        await tokenStorage.clear();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
};

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
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;
    const status = error?.response?.status;

    if (!originalRequest || status !== 401 || originalRequest._retry) {
      throw error;
    }

    if (originalRequest.url?.includes("/token/refresh/")) {
      throw error;
    }

    originalRequest._retry = true;
    const nextAccessToken = await refreshAccessToken();

    if (!nextAccessToken) {
      throw error;
    }

    originalRequest.headers = {
      ...(originalRequest.headers || {}),
      Authorization: `Bearer ${nextAccessToken}`,
    };

    return api(originalRequest);
  }
);
