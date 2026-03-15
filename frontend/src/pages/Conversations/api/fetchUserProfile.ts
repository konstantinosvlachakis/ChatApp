// api/userApi.ts
import { User } from "../../Profile/types";
import { BASE_URL } from "../../../constants/constants";
import { clearLegacyTokens, refreshSession } from "../../../utils/auth";

export const fetchUserProfile = async (): Promise<User> => {
  const makeRequest = () => fetch(BASE_URL + "/api/profile/", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
  });

  let response = await makeRequest();
  if (response.status === 401) {
    const refreshed = await refreshSession().catch(() => false);
    if (refreshed) {
      response = await makeRequest();
    }
  }

  if (response.ok) {
    return response.json();
  } else if (response.status === 401) {
    clearLegacyTokens();
    throw new Error("Unauthorized");
  } else {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to fetch profile");
  }
};
