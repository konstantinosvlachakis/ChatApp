import { useSyncExternalStore } from "react";
import { EMAIL_UNVERIFIED_CODE } from "../features/emailVerification";
import { toApiError } from "./api/errors";

// Email-verification session state shared by the API client, the verify prompt (AppTabs),
// the banner and VerifyEmailScreen. Module state = this app session only (resets on restart).

/** True for a 403 `email_unverified` from a gated endpoint (start chat, send, react, Lumi). */
export function isEmailUnverifiedError(error: unknown): boolean {
  const apiError = toApiError(error);
  return apiError.status === 403 && apiError.code === EMAIL_UNVERIFIED_CODE;
}

// --- Gated-action events: the API client publishes, AppTabs shows one prompt. -------------

export type EmailUnverifiedHandler = (message: string) => void;
const unverifiedHandlers = new Set<EmailUnverifiedHandler>();

export function publishEmailUnverified(message: string) {
  unverifiedHandlers.forEach((handler) => {
    try {
      handler(message);
    } catch {
      // One failing subscriber must not break the others.
    }
  });
}

export function subscribeToEmailUnverified(handler: EmailUnverifiedHandler) {
  unverifiedHandlers.add(handler);
  return () => {
    unverifiedHandlers.delete(handler);
  };
}

// --- Banner dismissal (per app session) and the resend cooldown. ---------------------------

let bannerDismissed = false;
const bannerListeners = new Set<() => void>();

export function dismissVerifyBanner() {
  if (bannerDismissed) return;
  bannerDismissed = true;
  bannerListeners.forEach((listener) => listener());
}

function subscribeBanner(listener: () => void) {
  bannerListeners.add(listener);
  return () => {
    bannerListeners.delete(listener);
  };
}

function getBannerDismissed() {
  return bannerDismissed;
}

export function useVerifyBannerDismissed() {
  return useSyncExternalStore(subscribeBanner, getBannerDismissed, getBannerDismissed);
}

// When "Resend code" becomes available again (ms epoch), kept across screen re-opens.
let resendAvailableAt = 0;

export function setResendAvailableIn(seconds: number) {
  resendAvailableAt = Date.now() + Math.max(0, seconds) * 1000;
}

export function getResendCooldownRemaining() {
  return Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000));
}

/** Logout: forget the session's cooldown and banner dismissal. */
export function resetEmailVerificationSession() {
  resendAvailableAt = 0;
  if (bannerDismissed) {
    bannerDismissed = false;
    bannerListeners.forEach((listener) => listener());
  }
}
