import api from "../../../lib/api";

export type DeleteMessageDTO = {
  messageId: number;
};

/**
 * Deletes a message by its ID.
 * @param messageId - The ID of the message to delete.
 * @returns A promise that resolves when the message is successfully deleted.
 * @throws ApiError when the request fails (the caller shows the toast).
 */
export const deleteMessage = async (messageId: number): Promise<{ messageId: number }> => {
  await api.delete(`/api/messages/${messageId}/delete/`);
  return { messageId };
};
