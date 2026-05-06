import axios from "axios";
import { BASE_URL } from "../../../constants/constants";

export const editMessage = async (messageId: number, text: string) => {
  const response = await axios.patch(
    `${BASE_URL}/api/messages/${messageId}/edit/`,
    { text },
    {
      withCredentials: true,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
};
