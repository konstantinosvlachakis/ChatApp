import React, { useState, useRef, useEffect } from "react";
import ChatHeader from "./ChatHeader";
import MessagesList from "./MessagesList";
import MessageInput from "./MessageInput";
import { useUser } from "../../../context/UserContext";
import axios from "axios";
import { deleteMessage } from "../api/deleteMessage";

const ChatRoom = ({ conversation }) => {
  const [messages, setMessages] = useState(conversation.messages || []);
  const { user } = useUser();
  const socket = useRef(null); // Use a ref to persist the socket connection

  useEffect(() => {
    // Create a new WebSocket connection
    let url = `ws://localhost:8000/api/ws/socket-server/${conversation.id}/`;

    // Set up WebSocket connection
    socket.current = new WebSocket(url);

    // Listen for incoming messages
    socket.current.onmessage = function (e) {
      let data = JSON.parse(e.data);
      console.log("Received WebSocket data:", data);

      if (data.type === "chat") {
        setMessages((prevMessages) => {
          console.log(
            "Checking for duplicates:",
            prevMessages.some((msg) => msg.id === data.id)
          );
          if (prevMessages.some((msg) => msg.id === data.id)) {
            return prevMessages; // Prevent duplicate addition
          }

          return [
            ...prevMessages,
            {
              id: data.id,
              text: data.message,
              sender: { username: data.sender },
              timestamp: new Date().toISOString(),
            },
          ];
        });
      }
    };

    // Cleanup WebSocket connection when the component unmounts
    return () => {
      socket.current.close();
    };
  }, [conversation.id]);

  const handleSendMessage = async (newMessage, attachedFile, previewImage) => {
    const formData = new FormData();
    if (newMessage.trim()) {
      formData.append("text", newMessage);
    }
    if (attachedFile) {
      formData.append("attachment", attachedFile);
    }

    const tempMessage = {
      id: Date.now(), // Temporary unique ID
      text: newMessage.trim() || null,
      sender: { id: user.user_id, username: user.username },
      timestamp: new Date().toISOString(),
      attachment: null,
      attachmentUrl: previewImage || null,
    };

    setMessages((prevMessages) => [...prevMessages, tempMessage]);

    try {
      const response = await axios.post(
        `http://localhost:8000/api/conversations/${conversation.id}/messages/`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem("accessToken")}`,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      const savedMessage = response.data;
      const baseURL = "http://localhost:8000";
      const fullUrl =
        savedMessage.attachmentUrl &&
        !savedMessage.attachmentUrl.startsWith("http")
          ? `${baseURL}${savedMessage.attachmentUrl}`
          : savedMessage.attachmentUrl;

      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === tempMessage.id
            ? {
                ...msg,
                id: savedMessage.id,
                text: savedMessage.text || msg.text,
                attachment: savedMessage.attachment || msg.attachment,
                attachmentUrl: fullUrl,
              }
            : msg
        )
      );

      socket.current.send(
        JSON.stringify({
          type: "chat",
          id: savedMessage.id, // Include the unique ID
          message: savedMessage.text,
          sender: user.username,
        })
      );
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prevMessages) =>
        prevMessages.filter((msg) => msg.id !== tempMessage.id)
      );
      alert("Failed to send the message. Please try again.");
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      // Optimistically remove the message from the UI
      setMessages((prevMessages) =>
        prevMessages.filter((msg) => msg.id !== messageId)
      );
      await deleteMessage(messageId);

      // Notify other users about the deleted message via WebSocket
      socket.current.send(
        JSON.stringify({
          type: "deleteMessage",
          messageId,
        })
      );
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-y-hidden">
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
