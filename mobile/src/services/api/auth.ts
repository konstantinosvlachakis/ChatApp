import { api, UPLOAD_TIMEOUT_MS } from "./client";
import { tokenStorage } from "../storage";
import { clearConversationsCache } from "./conversations";
import type { CorrectionPreference, ModerationSummary, Profile, ProfileListResponse } from "../../types";
import type { PeopleParams } from "../../features/peopleMatching";

export type RegistrationPracticeLevel = "beginner" | "intermediate" | "advanced" | "fluent";

export async function register(payload: {
  username: string;
  email: string;
  password: string;
  nativeLanguage: string;
  /** At least one learning language, excluding nativeLanguage. */
  practiceLanguages: string[];
  practiceLanguageLevels: Record<string, RegistrationPracticeLevel>;
  dateOfBirth?: string;
}) {
  const response = await api.post("/register/", payload);
  return response.data;
}

export async function login(email: string, password: string) {
  const response = await api.post("/token/", { email, password });
  const { access, refresh } = response.data;
  await tokenStorage.setAccessToken(access);
  if (refresh) {
    await tokenStorage.setRefreshToken(refresh);
  }
  return response.data;
}

/**
 * Asks the backend to email a password reset link. The response is the same whether
 * or not the address has an account; the reset itself happens on the web link.
 */
export async function requestPasswordReset(email: string) {
  const response = await api.post<{ message: string }>("/auth/password-reset/", {
    email: email.trim().toLowerCase(),
  });
  return response.data;
}

export type EmailVerificationSendResponse = {
  message: string;
  /** Where the code went (absent when already verified). */
  email?: string;
  /** Code lifetime in seconds (900). */
  expires_in?: number;
  /** true: the address was already verified and no code was sent. */
  email_verified: boolean;
};

/**
 * Emails a new 6-digit code to the signed-in user's address (register already sends the
 * first one). 429 `throttled` carries `retry_after` / Retry-After (ApiError.retryAfterSeconds).
 */
export async function sendEmailVerificationCode() {
  const response = await api.post<EmailVerificationSendResponse>("/auth/verify-email/send/");
  return response.data;
}

/**
 * Confirms the emailed code. 400 `invalid_code` (body may include `attempts_remaining`),
 * `code_expired`, `too_many_attempts`; 429 `throttled`.
 */
export async function confirmEmailVerification(code: string) {
  const response = await api.post<{ message: string; email_verified: boolean }>(
    "/auth/verify-email/confirm/",
    { code }
  );
  return response.data;
}

const LOGOUT_TIMEOUT_MS = 5_000;

/**
 * Revokes this device's refresh token on the server (best effort: bounded, network
 * errors ignored), then clears local session data. Refresh tokens rotate, so the one
 * sent is whatever SecureStore holds now.
 */
export async function logout() {
  clearConversationsCache();
  try {
    const refresh = await tokenStorage.getRefreshToken();
    if (refresh) {
      await api.post("/logout/", { refresh }, { timeout: LOGOUT_TIMEOUT_MS });
    }
  } catch {
    // Offline or server down: the token still expires on its own.
  }
  await tokenStorage.clear();
}

/** Signs out every device (this one included): all tokens are revoked server-side. */
export async function logoutAll() {
  const response = await api.post<{ message: string }>("/auth/logout-all/");
  return response.data;
}

/** Stores the fresh pair the server returns after an email change (other devices are signed out). */
async function storeSessionTokens(tokens: unknown) {
  const pair = tokens as { access?: unknown; refresh?: unknown } | null | undefined;
  if (typeof pair?.access !== "string" || typeof pair?.refresh !== "string") return;
  await tokenStorage.setRefreshToken(pair.refresh);
  await tokenStorage.setAccessToken(pair.access);
}

export async function fetchProfile() {
  const response = await api.get<Profile>("/profile/");
  return response.data;
}

export async function fetchPublicProfile(username: string) {
  const response = await api.get<Profile>(`/profile/public/${encodeURIComponent(username)}/`);
  return response.data;
}

export async function setFollowing(username: string, following: boolean) {
  const path = `/profile/public/${encodeURIComponent(username)}/follow/`;
  const response = following ? await api.post<{ is_following: boolean }>(path) : await api.delete<{ is_following: boolean }>(path);
  return response.data;
}

export async function fetchFollowing(page = 1, pageSize = 6) {
  const response = await api.get<ProfileListResponse>("/profile/following/", { params: { page, page_size: pageSize } });
  return response.data;
}

/**
 * People list (same params as web): `page`, `page_size`, `section=perfect|others`, optional
 * `include`, `they_speak`, `they_learn`, `level`, `near`, `active`, `new`, `my_level`, `sort`,
 * `counts` (built by `features/peopleMatching` perfectParams/othersParams/countParams).
 * Older builds send `match`, which the server still accepts.
 * No trailing slash: profile/data is the one API path without it.
 */
export async function fetchPeople(params: PeopleParams, options: { signal?: AbortSignal } = {}) {
  const response = await api.get<ProfileListResponse>("/profile/data", {
    params,
    signal: options.signal,
  });
  return response.data;
}

export async function updateSettings(payload: {
  base_translate_language?: string;
  languages_practicing?: string[];
  practice_language_levels?: Record<string, string>;
}) {
  const response = await api.patch("/profile/edit/", payload);
  return response.data;
}

/** `PATCH /profile/edit/ {correction_preference}`; returns the saved value. */
export async function updateCorrectionPreference(preference: CorrectionPreference): Promise<CorrectionPreference> {
  const response = await api.patch("/profile/edit/", { correction_preference: preference });
  return (response.data?.updated_profile?.correction_preference || preference) as CorrectionPreference;
}

export async function updateProfile(payload: {
  username?: string;
  email?: string;
  date_of_birth?: string | null;
  native_language?: string;
  base_translate_language?: string;
  location?: string;
  bio?: string;
  learning_goal?: string;
  avatar_ring_color?: string;
  languages_practicing?: string[];
  practice_language_levels?: Record<string, string>;
  /** Required by the server when `email` changes (400 password_required / 403 invalid_password). */
  current_password?: string;
}) {
  const response = await api.patch("/profile/edit/", payload);
  await storeSessionTokens(response.data?.tokens);
  return (response.data?.updated_profile || response.data) as Partial<Profile>;
}

export async function fetchModerationSummary() {
  const response = await api.get<ModerationSummary>("/profile/moderation/");
  return response.data;
}

export async function deleteAccount(currentPassword: string) {
  const response = await api.delete("/profile/delete/", {
    data: { current_password: currentPassword },
  });
  clearConversationsCache();
  await tokenStorage.clear();
  return response.data;
}

export async function blockUser(username: string) {
  const response = await api.post(`/profile/public/${encodeURIComponent(username)}/block/`);
  return response.data;
}

export async function unblockUser(username: string) {
  const response = await api.delete(`/profile/public/${encodeURIComponent(username)}/block/`);
  return response.data;
}

export async function reportUser(payload: {
  username: string;
  reason: string;
  details?: string;
}) {
  const response = await api.post(
    `/profile/public/${encodeURIComponent(payload.username)}/report/`,
    {
      reason: payload.reason,
      details: payload.details || "",
    }
  );
  return response.data;
}

export type ProfilePhotoSlot = "profile" | "complementary_1" | "complementary_2";

export async function uploadProfilePhoto(payload: {
  userId: number;
  slot: ProfilePhotoSlot;
  imageUri: string;
  fileName?: string;
  mimeType?: string;
}) {
  const formData = new FormData();
  formData.append("profile_image", {
    uri: payload.imageUri,
    name: payload.fileName || `profile-${Date.now()}.jpg`,
    type: payload.mimeType || "image/jpeg",
  } as any);
  formData.append("slot", payload.slot);

  const response = await api.patch(
    `/profile/${payload.userId}/update-image/`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: UPLOAD_TIMEOUT_MS,
    }
  );
  return response.data as Partial<Profile>;
}
