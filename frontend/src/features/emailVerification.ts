export const EMAIL_UNVERIFIED_EVENT = "langvoyage:email-unverified";

export const requestEmailVerification = (message?: string) => {
  window.dispatchEvent(new CustomEvent(EMAIL_UNVERIFIED_EVENT, { detail: message }));
};

export const sanitizeCode = (value: string) => value.replace(/\D/g, "").slice(0, 6);

// Scope to an address so changing email or signing into another account never
// inherits a different account's cooldown. sessionStorage survives page reloads.
const cooldownKey = (email: string) => `verify-email:resend:${email.toLowerCase()}`;
export const resendRemaining = (email: string) => {
  try {
    return Math.max(0, Math.ceil((Number(sessionStorage.getItem(cooldownKey(email))) - Date.now()) / 1000));
  } catch {
    return 0;
  }
};
export const startResendCooldown = (email: string, seconds = 60) => {
  try {
    sessionStorage.setItem(cooldownKey(email), String(Date.now() + seconds * 1000));
  } catch {
    // The server still enforces its mail budgets when browser storage is unavailable.
  }
};
