import api from "./api";

/** Languages collected by the onboarding steps (same keys as POST /api/register/). */
export type ProfileLanguages = {
  nativeLanguage: string;
  practiceLanguages: string[];
  practiceLanguageLevels: Record<string, string>;
  username?: string;
};

/** POST /api/auth/google/ and /api/token/ both answer with tokens (cookies are set too). */
export type GoogleSignInResponse = {
  access?: string;
  refresh?: string;
  /** True when this call created the account. */
  created: boolean;
  /** False when the account still has to pick its languages (/finish-profile). */
  profile_complete: boolean;
  username: string;
};

/**
 * Exchange a Google ID token for a LangVoyage session. `profile` is only used when the
 * call creates a new account; an existing account just logs in.
 */
export const googleSignIn = ({
  credential,
  rememberMe = true,
  profile,
}: {
  credential: string;
  rememberMe?: boolean;
  profile?: ProfileLanguages;
}) =>
  api.post<GoogleSignInResponse>("/api/auth/google/", {
    credential,
    remember_me: rememberMe,
    ...(profile ? { profile } : {}),
  });

/** Finish a profile created without languages (e.g. "Continue with Google" on log in). */
export const completeProfile = (profile: ProfileLanguages) =>
  api.post<{ username: string; profile_complete: true }>("/api/auth/complete-profile/", profile);

/** Error codes from the profile validation shared by register, Google sign-up and complete-profile. */
export const PROFILE_ERROR_FIELDS: Record<string, "native" | "practice" | "username"> = {
  invalid_native_language: "native",
  practice_language_required: "practice",
  practice_language_is_native: "practice",
  invalid_practice_language: "practice",
  invalid_practice_level: "practice",
  username_taken: "username",
  invalid_username: "username",
};

/** Friendlier copy for Google sign-in failures (other codes use the server message). */
export const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Google sign-in isn't available right now. Please use your email instead.",
  google_token_invalid: "Google sign-in didn't complete. Please try again.",
  google_email_unverified:
    "Your Google account's email isn't verified yet. Verify it with Google, or sign up with your email.",
  account_disabled: "This account has been disabled.",
};
