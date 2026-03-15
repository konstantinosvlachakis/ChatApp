import { api } from "./client";
import { tokenStorage } from "../storage";
import type { ModerationSummary, Profile, ProfileListResponse } from "../../types";

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

export async function logout() {
  await tokenStorage.clear();
}

export async function fetchProfile() {
  const response = await api.get<Profile>("/profile/");
  return response.data;
}

export async function fetchPublicProfile(username: string) {
  const response = await api.get<Profile>(`/profile/public/${encodeURIComponent(username)}/`);
  return response.data;
}

export async function fetchPeople(page = 1, pageSize = 24) {
  const response = await api.get<ProfileListResponse>(
    `/profile/data?page=${page}&page_size=${pageSize}`
  );
  return response.data;
}

export async function updateSettings(payload: {
  base_translate_language?: string;
  languages_practicing?: string[];
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
}) {
  const response = await api.patch("/profile/edit/", payload);
  return (response.data?.updated_profile || response.data) as Partial<Profile>;
}

export async function fetchModerationSummary() {
  const response = await api.get<ModerationSummary>("/profile/moderation/");
  return response.data;
}

export async function deleteAccount() {
  const response = await api.delete("/profile/delete/");
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
    }
  );
  return response.data as Partial<Profile>;
}
