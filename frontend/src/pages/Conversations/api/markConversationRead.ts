import api from "../../../lib/api";

/** PATCH the read receipt. Throws ApiError on failure (callers fall back to a list refetch). */
export const markConversationRead = async (conversationId: number | string) => {
  await api.patch(`/api/conversations/${conversationId}/read/`);
};
