import http from "../utils/axios";
import { BASE_URL } from "../constants/constants";
import { createApiClient, type HttpTransport } from "./apiClient";
import { logger } from "./logger";

export { API_TIMEOUTS } from "./apiClient";
export type { RequestOptions } from "./apiClient";
export {
  ApiError,
  getErrorMessage,
  isAbortError,
  isApiError,
  toApiError,
} from "./apiError";

/**
 * The single API client for the web app. Paths are backend paths ("/api/...").
 *
 * Built on the configured axios instance (utils/axios.ts), so every call gets cookies,
 * the X-CSRFToken header on unsafe methods and the single-flight 401 refresh + replay.
 * Adds per-request timeouts, GET/HEAD-only retries with backoff (network errors,
 * timeouts, 429/502/503/504; Retry-After respected; max 3 attempts), AbortSignal
 * support and errors normalised to ApiError.
 */
const transport: HttpTransport = (config) =>
  http.request({
    method: config.method,
    url: config.url,
    data: config.data,
    params: config.params,
    headers: config.headers,
    signal: config.signal,
    timeout: config.timeout,
    onUploadProgress: config.onUploadProgress
      ? (event) => config.onUploadProgress?.({ loaded: event.loaded, total: event.total })
      : undefined,
  });

export const api = createApiClient({
  transport,
  buildUrl: (path) => (/^https?:\/\//.test(path) ? path : `${BASE_URL}${path}`),
  onError: (error) => {
    // Server bugs are worth reporting (with the request id); 4xx and network blips are not.
    if (error.status >= 500 && ![502, 503, 504].includes(error.status)) {
      logger.error("API request failed", error);
    }
  },
});

export default api;
