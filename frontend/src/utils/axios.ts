import axios, { AxiosHeaders } from "axios";
import { ensureCsrfToken, getStoredCsrfToken } from "./csrf";

const instance = axios.create({
  baseURL: process.env.REACT_APP_BASE_URL || "https://langvoyage-d3781c6fad54.herokuapp.com", // Replace with your backend's base URL
  withCredentials: true, // Ensures cookies are sent
});

const isUnsafeMethod = (method = "GET") =>
  !["GET", "HEAD", "OPTIONS", "TRACE"].includes(String(method).toUpperCase());

instance.interceptors.request.use(async (config) => {
  if (isUnsafeMethod(config.method)) {
    const csrfToken = getStoredCsrfToken() || (await ensureCsrfToken());
    const headers = AxiosHeaders.from(config.headers);
    headers.set("X-CSRFToken", csrfToken);
    config.headers = headers;
  }

  return config;
});

export default instance;
