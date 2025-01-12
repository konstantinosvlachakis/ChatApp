import axios from "axios";

export type DeleteMessageDTO = {
  messageId: number;
};

/**
 * Deletes a message by its ID.
 * @param messageId - The ID of the message to delete.
 * @returns A promise that resolves when the message is successfully deleted.
 */
export const deleteMessage = async (messageId: number): Promise<{ messageId: number }> => {
  try {
    await axios.delete(`http://localhost:8000/api/messages/${messageId}/delete/`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      },
    });
    return { messageId };
  } catch (error) {
    console.error("Error deleting message:", error);
    throw error; // Rethrow the error for handling in the mutation
  }
};

