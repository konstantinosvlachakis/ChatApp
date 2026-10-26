import { BASE_URL } from "../../../constants/constants";

export const markConversationRead = async (conversationId: number | string) => {
  await fetch(`${BASE_URL}/api/conversations/${conversationId}/read/`, {
    method: "PATCH",
    credentials: "include",
  });
};
