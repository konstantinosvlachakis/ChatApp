// api/userApi.ts
import { User } from "../../Profile/types";
import { NavigateFunction } from "react-router-dom";
import { BASE_URL } from "../../../constants/constants";

export const fetchUserProfile = async (
  setUser: React.Dispatch<React.SetStateAction<User | null>>,
  setNewDate: React.Dispatch<React.SetStateAction<string>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  navigate: NavigateFunction // Pass navigate as an argument
): Promise<void> => {
  try {
    const token = sessionStorage.getItem("accessToken");
    const response = await fetch(BASE_URL + "/api/profile/", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });

    if (response.ok) {
      const userData: User = await response.json();
      setUser(userData);
      setNewDate(userData.newDate);
      console.log("User profile fetched successfully");
    } else if (response.status === 401) {
      // If unauthorized, clear the token and navigate to login
      sessionStorage.removeItem("accessToken");
      navigate("/login");
    } else {
      const errorData = await response.json();
      setError(errorData.error);
      console.error("Error fetching profile:", errorData.error);
    }
  } catch (error) {
    setError((error as Error).message);
    console.error("Error fetching profile:", error);
  }
};
