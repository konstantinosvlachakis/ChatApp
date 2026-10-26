import { captureException } from "./sentry";

/**
 * App logger. Development and tests keep console output; production builds are silent
 * and only `logger.error` reports to Sentry (when REACT_APP_SENTRY_DSN is set).
 * Never pass user data (messages, emails, tokens) as log arguments.
 */
const isProduction = process.env.NODE_ENV === "production";

/* eslint-disable no-console */
export const logger = {
  debug: (...args: unknown[]) => {
    if (!isProduction) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (!isProduction) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    if (!isProduction) console.warn(...args);
  },
  error: (message: string, error?: unknown, context?: Record<string, unknown>) => {
    if (!isProduction) console.error(message, ...(error === undefined ? [] : [error]));
    captureException(error instanceof Error ? error : new Error(message), {
      message,
      ...(context || {}),
    });
  },
};
/* eslint-enable no-console */

export default logger;
