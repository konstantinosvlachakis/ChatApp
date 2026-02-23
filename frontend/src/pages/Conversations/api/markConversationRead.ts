import { BASE_URL } from "../../../constants/constants";

export const markConversationRead = async (conversationId: number | string) => {
  const token =
    sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");
  if (!token) return;

  await fetch(`${BASE_URL}/api/conversations/${conversationId}/read/`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

