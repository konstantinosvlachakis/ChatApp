// api/userApi.ts
import { ProfileResponse } from "../types";
import { NavigateFunction } from "react-router-dom";
import { BASE_URL } from "../../../constants/constants";

export const getProfileData = async (
 
  navigate: NavigateFunction // Pass navigate as an argument
): Promise<ProfileResponse | void> => {
  try {
    const token = sessionStorage.getItem("accessToken");
    const response = await fetch(BASE_URL + "/api/profile/data", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });

    if (response.ok) {
      const userData: ProfileResponse = await response.json();
      console.log("User profile fetched successfully:", userData);
      return userData;
    } else if (response.status === 401) {
      // If unauthorized, clear the token and navigate to login
      sessionStorage.removeItem("accessToken");
      navigate("/login");
    } else {
      const errorData = await response.json();
      
      console.error("Error fetching profile:", errorData.error);
    }
  } catch (error) {
    console.error("Error fetching profile:", error);
  }
};