import React, { useState } from "react";
import ChatHeader from "./ChatHeader";
import MessagesList from "./MessagesList";
import MessageInput from "./MessageInput";
import { useUser } from "../../../context/UserContext";
import axios from "axios";
import { deleteMessage } from "../api/deleteMessage";

const ChatRoom = ({ conversation }) => {
  const [messages, setMessages] = useState(conversation.messages || []);
  const { user } = useUser();

  const handleSendMessage = async (newMessage, attachedFile, previewImage) => {
    const formData = new FormData();
    if (newMessage.trim()) {
      formData.append("text", newMessage);
    }
    if (attachedFile) {
      formData.append("attachment", attachedFile);
    }

    // Generate a temporary message
    const tempMessage = {
      id: Date.now(), // Temporary unique ID
      text: newMessage.trim() || null,
      sender: { id: user.user_id, username: user.username },
      timestamp: new Date().toISOString(),
      attachment: null, // Placeholder for the attachment
      attachmentUrl: previewImage || null, // Temporary preview for the attachment
    };

    console.log("Temporary message added to the frontend:", tempMessage);

    setMessages((prevMessages) => [...prevMessages, tempMessage]);

    try {
      // Send the message to the backend
      const response = await axios.post(
        `http://localhost:8000/api/conversations/${conversation.id}/messages/`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      const savedMessage = response.data;
      const baseURL = "http://localhost:8000";

      // Construct the full attachment URL
      const fullUrl =
        savedMessage.attachmentUrl &&
        !savedMessage.attachmentUrl.startsWith("http")
          ? `${baseURL}${savedMessage.attachmentUrl}`
          : savedMessage.attachmentUrl;

      console.log("Message received from the backend:", savedMessage);

      // Replace temporary message with the saved message from the backend
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === tempMessage.id
            ? {
                ...msg, // Keep the existing temporary message structure
                id: savedMessage.id, // Update with backend-generated ID
                text: savedMessage.text || msg.text,
                attachment: savedMessage.attachment || msg.attachment,
                attachmentUrl: fullUrl, // Use the fully qualified URL
              }
            : msg
        )
      );
    } catch (error) {
      console.error("Error sending message:", error);
      // Remove the temporarily added message in case of error
      setMessages((prevMessages) =>
        prevMessages.filter((msg) => msg.id !== tempMessage.id)
      );
      alert("Failed to send the message. Please try again.");
    }
  };

  // Handle deleting a message
  const handleDeleteMessage = async (messageId) => {
    try {
      // Optimistic UI Update: Remove the message from the state before the API call
      setMessages((prevMessages) =>
        prevMessages.filter((msg) => msg.id !== messageId)
      );

      // Call the API to delete the message
      await deleteMessage(messageId);

      console.log("Message deleted successfully.");
    } catch (error) {
      console.error("Failed to delete message:", error);

      // If there's an error, rollback the UI to its previous state
      setMessages(
        (prevMessages) => prevMessages // Add the message back in case of error
      );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-hidden">
      <ChatHeader conversation={conversation} />
      <MessagesList
        messages={messages}
        userId={user.user_id}
        onDeleteMessage={handleDeleteMessage}
      />
      <MessageInput onSendMessage={handleSendMessage} />
    </div>
  );
};

export default ChatRoom;
