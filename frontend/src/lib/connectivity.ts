import { useSyncExternalStore } from "react";
import type { ApiError } from "./apiError";

/**
 * Tiny connectivity store shared by the API client, the presence socket (Layout) and
 * the ConnectivityBanner.
 *
 * - `online`: navigator.onLine plus the window online/offline events.
 * - `apiFailureStreak`: consecutive "server unreachable" API failures (network errors,
 *   timeouts, 502/503/504). Any HTTP response resets it.
 * - `socketReconnecting`: the presence socket dropped unexpectedly and is backing off.
 */
export type ConnectivityStatus = "online" | "offline" | "reconnecting";

export type ConnectivityState = {
  online: boolean;
  apiFailureStreak: number;
  socketReconnecting: boolean;
};

/** Failures in a row before the banner says "Reconnecting…". */
export const API_FAILURE_THRESHOLD = 2;

const UNREACHABLE_STATUSES = new Set([502, 503, 504]);

const initialOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

let state: ConnectivityState = {
  online: initialOnline(),
  apiFailureStreak: 0,
  socketReconnecting: false,
};
const listeners = new Set<() => void>();

const setState = (patch: Partial<ConnectivityState>) => {
  const next = { ...state, ...patch };
  if (
    next.online === state.online &&
    next.apiFailureStreak === state.apiFailureStreak &&
    next.socketReconnecting === state.socketReconnecting
  ) {
    return;
  }
  state = next;
  listeners.forEach((listener) => listener());
};

export const getConnectivityState = () => state;

export const subscribeConnectivity = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const deriveStatus = (value: ConnectivityState): ConnectivityStatus => {
  if (!value.online) return "offline";
  if (value.socketReconnecting || value.apiFailureStreak >= API_FAILURE_THRESHOLD) {
    return "reconnecting";
  }
  return "online";
};

/** Whether an API error means "the server is unreachable" (vs. an app-level error). */
export const isUnreachableError = (error: ApiError) =>
  error.code === "network_error" || error.code === "timeout" || UNREACHABLE_STATUSES.has(error.status);

export const reportApiFailure = (error: ApiError) => {
  if (error.code === "aborted") return;
  if (isUnreachableError(error)) {
    setState({ apiFailureStreak: state.apiFailureStreak + 1 });
  } else if (error.status > 0) {
    // The server answered (4xx / other 5xx), so it is reachable.
    setState({ apiFailureStreak: 0 });
  }
};

export const reportApiSuccess = () => {
  if (state.apiFailureStreak !== 0) setState({ apiFailureStreak: 0 });
};

export const setSocketReconnecting = (reconnecting: boolean) => {
  setState({ socketReconnecting: reconnecting });
};

export const setOnline = (online: boolean) => {
  setState({ online });
};

/** Reset everything (logout / tests). */
export const resetConnectivity = () => {
  setState({ online: initialOnline(), apiFailureStreak: 0, socketReconnecting: false });
};

let windowListenersInstalled = false;

export const installConnectivityListeners = () => {
  if (windowListenersInstalled || typeof window === "undefined") return;
  windowListenersInstalled = true;
  window.addEventListener("online", () => setOnline(true));
  window.addEventListener("offline", () => setOnline(false));
};

export const useConnectivityStatus = (): ConnectivityStatus => {
  const snapshot = useSyncExternalStore(subscribeConnectivity, getConnectivityState, getConnectivityState);
  return deriveStatus(snapshot);
};
