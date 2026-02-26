import AsyncStorage from "@react-native-async-storage/async-storage";

const ACCESS_TOKEN_KEY = "lv_access_token";
const REFRESH_TOKEN_KEY = "lv_refresh_token";

export const tokenStorage = {
  async getAccessToken() {
    return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  },
  async setAccessToken(token: string) {
    return AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
  },
  async getRefreshToken() {
    return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  },
  async setRefreshToken(token: string) {
    return AsyncStorage.setItem(REFRESH_TOKEN_KEY, token);
  },
  async clear() {
    await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
  },
};
