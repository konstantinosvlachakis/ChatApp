import { api } from "./client";
import { tokenStorage } from "../storage";
import type { Profile, ProfileListResponse } from "../../types";

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
