import axios from "axios";
import { BASE_URL } from "../../../constants/constants";

export const createOrGetConversation = async (username: string) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/api/conversations/`,
        { participant: username },
        {
          headers: {
            "Content-Type": "application/json",
          },
          withCredentials: true,
        }
      );
  
      return response.data;
    } catch (error) {
      console.error("Error creating/getting conversation:", error);
      throw error;
    }
  };
