import axios from "axios";
import { BASE_URL } from "../../../constants/constants";

export const pinMessage = async (messageId: number, isPinned: boolean) => {
  const response = await axios.patch(
    `${BASE_URL}/api/messages/${messageId}/pin/`,
    { is_pinned: isPinned },
    {
      withCredentials: true,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
};
