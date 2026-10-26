import api from "../../../lib/api";

export const editMessage = async (messageId: number, text: string) =>
  api.patch(`/api/messages/${messageId}/edit/`, { text });
