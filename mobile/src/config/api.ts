import { Platform } from "react-native";
import Constants from "expo-constants";

const getExpoHost = () => {
  const constants = Constants as any;
  const hostUri =
    constants?.expoConfig?.hostUri ||
    constants?.manifest2?.extra?.expoGo?.debuggerHost ||
    constants?.manifest?.debuggerHost;

  if (!hostUri || typeof hostUri !== "string") {
    return null;
  }
  return hostUri.split(":")[0] || null;
};

export const getApiBaseUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (envUrl) {
    return envUrl;
  }

  // Web frontend runs on this machine.
  if (Platform.OS === "web") {
    return "http://127.0.0.1:8000";
  }

  // Native (Expo Go / simulator): derive host from Metro so LAN changes do not break API calls.
  const expoHost = getExpoHost();
  if (expoHost) {
    return `http://${expoHost}:8000`;
  }

  // Fallbacks.
  if (Platform.OS === "ios") {
    return "http://127.0.0.1:8000";
  }

  // Android emulator default bridge to host machine.
  return "http://10.0.2.2:8000";
};

export const API_BASE_URL = getApiBaseUrl();
