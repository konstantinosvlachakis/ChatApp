import { useSyncExternalStore } from "react";

/**
 * Connectivity as seen by the app (no NetInfo dependency): a streak of API
 * network/5xx failures, plus the presence socket's state from RootNavigator.
 * Any HTTP response (even a 4xx) proves the server is reachable and resets the streak.
 */
export type ConnectivityStatus = "online" | "offline" | "reconnecting";

type State = {
  apiFailureStreak: number;
  lastFailureWasNetwork: boolean;
  socketReconnecting: boolean;
};

const API_FAILURE_THRESHOLD = 2;

let state: State = { apiFailureStreak: 0, lastFailureWasNetwork: false, socketReconnecting: false };
let snapshot: ConnectivityStatus = "online";
const listeners = new Set<() => void>();

function computeStatus(current: State): ConnectivityStatus {
  if (current.apiFailureStreak >= API_FAILURE_THRESHOLD) {
    return current.lastFailureWasNetwork ? "offline" : "reconnecting";
  }
  if (current.socketReconnecting) return "reconnecting";
  return "online";
}

function update(next: Partial<State>) {
  state = { ...state, ...next };
  const nextSnapshot = computeStatus(state);
  if (nextSnapshot !== snapshot) {
    snapshot = nextSnapshot;
    listeners.forEach((listener) => listener());
  }
}

/** A request got an HTTP response. */
export function reportApiSuccess() {
  if (state.apiFailureStreak !== 0) update({ apiFailureStreak: 0, lastFailureWasNetwork: false });
}

/** A request failed without a response (network/timeout) or with 502/503/504. */
export function reportApiFailure(kind: "network" | "server") {
  update({
    apiFailureStreak: state.apiFailureStreak + 1,
    lastFailureWasNetwork: kind === "network",
  });
}

/** Presence socket: true while it is closed unexpectedly and waiting to reconnect. */
export function setSocketReconnecting(reconnecting: boolean) {
  if (state.socketReconnecting !== reconnecting) update({ socketReconnecting: reconnecting });
  // An open socket means the server is reachable.
  if (!reconnecting) reportApiSuccess();
}

export function getConnectivityStatus() {
  return snapshot;
}

export function subscribeConnectivity(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useConnectivityStatus() {
  return useSyncExternalStore(subscribeConnectivity, getConnectivityStatus, getConnectivityStatus);
}

/** Test/logout helper. */
export function resetConnectivity() {
  update({ apiFailureStreak: 0, lastFailureWasNetwork: false, socketReconnecting: false });
}
