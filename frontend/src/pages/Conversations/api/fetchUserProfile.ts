// api/userApi.ts
import { User } from "../../Profile/types";
import { BASE_URL } from "../../../constants/constants";

export const fetchUserProfile = async (): Promise<User> => {
  const token =
    sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");
  if (!token) throw new Error("No access token found");

  // Keep session storage in sync for APIs that still read from session storage.
  if (!sessionStorage.getItem("accessToken")) {
    sessionStorage.setItem("accessToken", token);
  }

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
    sessionStorage.removeItem("refreshToken");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    throw new Error("Unauthorized");
  } else {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to fetch profile");
  }
};
