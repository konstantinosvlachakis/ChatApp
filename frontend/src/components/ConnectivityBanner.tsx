import React, { useEffect } from "react";
import api from "../lib/api";
import {
  getConnectivityState,
  installConnectivityListeners,
  useConnectivityStatus,
} from "../lib/connectivity";

const HEALTH_PROBE_INTERVAL_MS = 10_000;

/**
 * "You're offline" / "Reconnecting…" banner. Driven by navigator.onLine, consecutive
 * unreachable-API failures and the presence socket state (lib/connectivity). While the
 * API looks unreachable it probes GET /api/health/ so the banner clears on recovery
 * even if nothing else is making requests.
 */
const ConnectivityBanner = () => {
  const status = useConnectivityStatus();

  useEffect(() => {
    installConnectivityListeners();
  }, []);

  useEffect(() => {
    if (status !== "reconnecting") return undefined;
    // Only probe for API failures; the presence socket recovers by itself.
    if (getConnectivityState().apiFailureStreak === 0) return undefined;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      api.get("/api/health/", { maxAttempts: 1, timeoutMs: 5000, signal: controller.signal }).catch(() => {
        // Still unreachable: the store keeps the banner up.
      });
    }, HEALTH_PROBE_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [status]);

  if (status === "online") return null;

  const offline = status === "offline";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-0 z-[1100] flex items-center justify-center gap-2 px-4 py-1.5 text-center text-sm font-medium text-white shadow ${
        offline ? "bg-slate-800" : "bg-amber-600"
      }`}
    >
      {!offline && (
        <span
          aria-hidden="true"
          className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
        />
      )}
      <span>{offline ? "You're offline" : "Reconnecting…"}</span>
    </div>
  );
};

export default ConnectivityBanner;
