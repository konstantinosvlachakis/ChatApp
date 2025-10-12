// api/userApi.ts
import { User } from "../../Profile/types";
import { BASE_URL } from "../../../constants/constants";

export const fetchUserProfile = async (): Promise<User> => {
  const token = sessionStorage.getItem("accessToken");
  if (!token) throw new Error("No access token found");

  const response = await fetch(BASE_URL + "/api/profile/", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });

  if (response.ok) {
    return response.json();
  } else if (response.status === 401) {
    sessionStorage.removeItem("accessToken");
    throw new Error("Unauthorized");
  } else {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to fetch profile");
  }
};
