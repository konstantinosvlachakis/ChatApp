import { Platform } from "react-native";

export const getApiBaseUrl = () => {
  // Phone/LAN testing target (Daphne on your machine).
  // Keep this as your computer LAN IP while testing on a real device.
  return "http://192.168.1.165:8000";
};

export const API_BASE_URL = getApiBaseUrl();
