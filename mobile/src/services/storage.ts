import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ACCESS_TOKEN_KEY = "lv_access_token";
const REFRESH_TOKEN_KEY = "lv_refresh_token";
const THEME_MODE_KEY = "lv_theme_mode";
const PROFILE_VIEW_LAST_NOTIFIED_AT_KEY_PREFIX = "lv_profile_view_last_notified_at";

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainService: "langvoyage.auth",
};

export const tokenStorage = {
  async getAccessToken() {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY, secureStoreOptions);
  },
  async setAccessToken(token: string) {
    return SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token, secureStoreOptions);
  },
  async getRefreshToken() {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY, secureStoreOptions);
  },
  async setRefreshToken(token: string) {
    return SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, secureStoreOptions);
  },
  async clear() {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY, secureStoreOptions),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, secureStoreOptions),
    ]);
  },
};

export const themeStorage = {
  async getThemeMode() {
    return AsyncStorage.getItem(THEME_MODE_KEY);
  },
  async setThemeMode(mode: "light" | "dark") {
    return AsyncStorage.setItem(THEME_MODE_KEY, mode);
  },
};

export const profileViewNotificationStorage = {
  async getLastNotifiedAt(userId?: number | null) {
    if (!userId) return null;
    return AsyncStorage.getItem(`${PROFILE_VIEW_LAST_NOTIFIED_AT_KEY_PREFIX}:${userId}`);
  },
  async setLastNotifiedAt(userId: number, viewedAt: string) {
    return AsyncStorage.setItem(
      `${PROFILE_VIEW_LAST_NOTIFIED_AT_KEY_PREFIX}:${userId}`,
      viewedAt
    );
  },
  async clear(userId?: number | null) {
    if (!userId) return;
    return AsyncStorage.removeItem(`${PROFILE_VIEW_LAST_NOTIFIED_AT_KEY_PREFIX}:${userId}`);
  },
};
