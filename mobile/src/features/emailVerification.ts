// Pure helpers for email verification (VerifyEmailScreen, CodeInput, banner). No React Native
// imports, so they stay runnable under plain Node (type stripping) like the other features/*.ts.

export const VERIFICATION_CODE_LENGTH = 6;
/** Client-side wait between "Resend code" taps (the server throttles 3 per 10 min, 10/day). */
export const RESEND_COOLDOWN_SECONDS = 60;
/** API error code returned (403) by actions that need a verified email. */
export const EMAIL_UNVERIFIED_CODE = "email_unverified";

/** Digits only, at most 6: handles pasted "123 456", "123-456" or "Your code: 123456". */
export function sanitizeVerificationCode(text: string | null | undefined): string {
  return String(text ?? "")
    .replace(/\D+/g, "")
    .slice(0, VERIFICATION_CODE_LENGTH);
}

export function isCompleteVerificationCode(code: string): boolean {
  return new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`).test(code);
}

/** "0:45" / "1:30" for the resend cooldown. */
export function formatCooldown(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** Cooldown after a send: the server's Retry-After when it sent one (throttled), else 60 s. */
export function cooldownSeconds(retryAfterSeconds?: number | null): number {
  if (typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.ceil(retryAfterSeconds);
  }
  return RESEND_COOLDOWN_SECONDS;
}

/** Errors after which the current code is dead and the user should request a new one. */
export function needsNewCode(errorCode: string | null | undefined): boolean {
  return errorCode === "code_expired" || errorCode === "too_many_attempts";
}

/** `attempts_remaining` from a 400 invalid_code body, when present. */
export function attemptsRemaining(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const value = (data as { attempts_remaining?: unknown }).attempts_remaining;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Only an explicit `false` means "not verified": older servers omit the field and must not nag.
 */
export function isEmailUnverified(user: { email_verified?: boolean } | null | undefined): boolean {
  return user?.email_verified === false;
}
