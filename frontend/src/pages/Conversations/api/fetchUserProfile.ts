// api/userApi.ts
import { User } from "../../Profile/types";
import { BASE_URL } from "../../../constants/constants";
import { clearLegacyTokens } from "../../../utils/auth";

export const fetchUserProfile = async (): Promise<User> => {
  // A 401 is refreshed and retried once by the global fetch patch (utils/csrf.ts).
  const response = await fetch(BASE_URL + "/api/profile/", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
  });

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
