import { api, UPLOAD_TIMEOUT_MS } from "./client";
import { tokenStorage } from "../storage";
import { clearConversationsCache } from "./conversations";
import type { ModerationSummary, Profile, ProfileListResponse } from "../../types";
import { buildPeopleParams, type PeopleQuery } from "../../features/peopleMatching";

export async function register(payload: {
  username: string;
  email: string;
  password: string;
  nativeLanguage: string;
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

/**
 * People list with server matching (same params as web): `page`, `page_size`, `match`
 * (all | reciprocal | teaches_me) and optional `level` (their level in my native language).
 * No trailing slash: profile/data is the one API path without it.
 */
export async function fetchPeople(query: PeopleQuery, options: { signal?: AbortSignal } = {}) {
  const response = await api.get<ProfileListResponse>("/profile/data", {
    params: buildPeopleParams(query),
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
