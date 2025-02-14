import axios from "axios";
import { BASE_URL } from "../../../constants/constants";

export const createOrGetConversation = async (username: string) => {
    try {
      const token = sessionStorage.getItem("accessToken");
      console.log("asdasd")

      if (!token) {
        console.error("No authentication token found");
        return;
      }
  
      const response = await axios.post(
        `${BASE_URL}/api/conversations/`,
        { participant: username },
        {
          headers: {
            Authorization: `Bearer ${token}`, // Attach the token in headers
            "Content-Type": "application/json",
          },
        }
      );
  
      return response.data;
    } catch (error) {
      console.error("Error creating/getting conversation:", error);
      throw error;
    }
  };