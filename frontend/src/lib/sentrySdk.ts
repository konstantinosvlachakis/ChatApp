// The only Sentry APIs the app uses. lib/sentry.ts imports this module dynamically, so
// webpack tree-shakes @sentry/react down to these exports in a lazy chunk.
export { browserTracingIntegration, captureException, init, withScope } from "@sentry/react";
