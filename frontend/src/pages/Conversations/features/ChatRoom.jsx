import React, { useState, useRef, useEffect } from "react";
import ChatHeader from "./ChatHeader";
import Conversation from "./Conversation";
import MessageInput from "./MessageInput";
import axios from "axios";
import { deleteMessage } from "../api/deleteMessage";
import { BASE_URL } from "../../../constants/constants";
import { useUser } from "../../../context/UserContext";

const ChatRoom = ({ conversation }) => {
  const [messages, setMessages] = useState(conversation.messages || []);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const socket = useRef(null);
  const typingTimeoutRef = useRef(null);
  const { user, loading } = useUser();

  // ------------------- WebSocket Setup -------------------
  useEffect(() => {
    if (!conversation?.id || !user) return;

    const isProduction = process.env.NODE_ENV === "production";
    const baseUrl = isProduction
      ? "wss://langvoyage-d3781c6fad54.herokuapp.com"
      : "ws://localhost:8000";

    const url = `${baseUrl}/ws/socket-server/${conversation.id}/`;
    socket.current = new WebSocket(url);

    socket.current.onopen = () => console.log("WebSocket connected.");

    socket.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        switch (data.type) {
          case "chat":
            setMessages((prev) => [
              ...prev,
              {
                id: data.id,
                text: data.message,
                sender: { id: data.senderId, username: data.sender },
                attachmentUrl: data.attachmentUrl || null,
                timestamp: new Date().toISOString(),
              },
            ]);
            break;

          case "deleteMessage":
            setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
            break;

          case "user_typing":
            setIsOtherUserTyping(true);
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(
              () => setIsOtherUserTyping(false),
              3000
            );
            break;

          case "user_stopped_typing":
            setIsOtherUserTyping(false);
            break;

          default:
            console.warn("Unknown message type:", data.type);
        }
      } catch (err) {
        console.error("Invalid WebSocket message:", e.data);
      }
    };

    socket.current.onclose = () =>
      console.log("WebSocket disconnected for conversation:", conversation.id);

    return () => {
      socket.current?.close();
      clearTimeout(typingTimeoutRef.current);
    };
  }, [conversation?.id, user]);

  // ------------------- Loading State -------------------
  if (loading) {
    return <div className="p-4 text-gray-500">Loading user info...</div>;
  }
  if (!user) {
    return <div className="p-4 text-red-500">Failed to load user.</div>;
  }

  // ------------------- Send Message -------------------
  const handleSendMessage = async (newMessage, attachedFile, previewImage) => {
    if (!user) {
      console.error("Cannot send message: user is undefined.");
      return;
    }

    if (!newMessage.trim() && !attachedFile) return;

    const formData = new FormData();
    if (newMessage.trim()) formData.append("text", newMessage);
    if (attachedFile) formData.append("attachment", attachedFile);

    const tempMessage = {
      id: Date.now(),
      text: newMessage.trim() || null,
      sender: { id: user.user_id, username: user.username },
      timestamp: new Date().toISOString(),
      attachmentUrl: previewImage || null,
    };

    setMessages((prev) => [...prev, tempMessage]);

    try {
      const response = await axios.post(
        `${BASE_URL}/api/conversations/${conversation.id}/messages/`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem("accessToken")}`,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      const savedMessage = response.data;
      console.log("Saved message:", response.data);

      // Broadcast the new message to others
      if (socket.current && socket.current.readyState === WebSocket.OPEN) {
        socket.current.send(
          JSON.stringify({
            type: "chat",
            id: savedMessage.id,
            message: savedMessage.text,
            sender: user.username,
            senderId: user.user_id,
            attachmentUrl:
              savedMessage.attachment_url ||
              savedMessage.attachmentUrl ||
              null, // ensure the URL for audio/image/video is sent
          })
        );
      } else {
        console.error("WebSocket is not open. Unable to send message.");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
    }
  };

  // ------------------- Typing Indicators -------------------
  const handleTyping = () => {
    socket.current?.send(
      JSON.stringify({ type: "user_typing", sender: user.username })
    );
  };

  // ------------------- Delete Message -------------------
  const handleDeleteMessage = async (messageId) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));

    try {
      await deleteMessage(messageId);
      socket.current?.send(
        JSON.stringify({ type: "deleteMessage", messageId })
      );
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
  };

  // ------------------- Render -------------------
  return (
    <div className="flex flex-col h-[calc(100vh-128px)] bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0">
        <ChatHeader conversation={conversation} />
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        <Conversation
          messages={messages}
          userId={user.user_id}
          onDeleteMessage={handleDeleteMessage}
        />
      </div>

      {/* Typing indicator */}
      {isOtherUserTyping && (
        <div className="text-gray-500 text-sm px-4 py-1">
          The other user is typing...
        </div>
      )}

      {/* Message input */}
      <div className="flex-shrink-0 border-t bg-white p-2">
        <MessageInput
          onSendMessage={handleSendMessage}
          onTyping={handleTyping}
          isOtherUserTyping={isOtherUserTyping}
        />
      </div>
    </div>
  );
};

export default ChatRoom;
