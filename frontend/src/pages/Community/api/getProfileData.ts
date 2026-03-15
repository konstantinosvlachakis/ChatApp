// api/userApi.ts
import { ProfileResponse } from "../types";
import { NavigateFunction } from "react-router-dom";
import { BASE_URL } from "../../../constants/constants";
import { clearLegacyTokens } from "../../../utils/auth";

export const getProfileData = async (
  page = 1,
  pageSize = 24,
  navigate: NavigateFunction // Pass navigate as an argument
): Promise<ProfileResponse | void> => {
  try {
    const response = await fetch(
      `${BASE_URL}/api/profile/data?page=${page}&page_size=${pageSize}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      }
    );

    if (response.ok) {
      const userData: ProfileResponse = await response.json();
      console.log("User profile fetched successfully:", userData);
      return userData;
    } else if (response.status === 401) {
      // If unauthorized, clear the token and navigate to login
      clearLegacyTokens();
      navigate("/login");
    } else {
      const errorData = await response.json();

      console.error("Error fetching profile:", errorData.error);
    }
  } catch (error) {
    console.error("Error fetching profile:", error);
  }
};
