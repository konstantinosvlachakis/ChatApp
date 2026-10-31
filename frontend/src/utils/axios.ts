import axios, { AxiosHeaders } from "axios";
import { ensureCsrfToken, getStoredCsrfToken, installSessionRefreshInterceptor } from "./csrf";
import { getLegacyAccessToken } from "./auth";
import { requestEmailVerification } from "../features/emailVerification";

const instance = axios.create({
  baseURL: process.env.REACT_APP_BASE_URL || "",
  withCredentials: true, // Ensures cookies are sent
});

const isUnsafeMethod = (method = "GET") =>
  !["GET", "HEAD", "OPTIONS", "TRACE"].includes(String(method).toUpperCase());

instance.interceptors.request.use(async (config) => {
  const headers = AxiosHeaders.from(config.headers);
  const legacyAccessToken = getLegacyAccessToken();

  if (legacyAccessToken) {
    headers.set("Authorization", `Bearer ${legacyAccessToken}`);
  }

  if (isUnsafeMethod(config.method)) {
    const csrfToken = getStoredCsrfToken() || (await ensureCsrfToken());
    headers.set("X-CSRFToken", csrfToken);
  }

  config.headers = headers;
  return config;
});

installSessionRefreshInterceptor(instance);

instance.interceptors.response.use((response) => response, (error) => {
  if (error.response?.status === 403 && error.response?.data?.code === "email_unverified") {
    requestEmailVerification(error.response.data.error);
  }
  return Promise.reject(error);
});

export default instance;
