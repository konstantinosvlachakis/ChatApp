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
  const user = useUser();

  useEffect(() => {
    if (!conversation?.id) return;

    const isProduction = process.env.NODE_ENV === "production";
    const baseUrl = isProduction
      ? "wss://langvoyage-d3781c6fad54.herokuapp.com"
      : "ws://localhost:8000";

    const url = `${baseUrl}/ws/socket-server/${conversation.id}/`;
    socket.current = new WebSocket(url);

    socket.current.onopen = () =>
      console.log("WebSocket connection established.");

    socket.current.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.type === "chat" && data.senderId !== user.user_id) {
        setMessages((prev) => [
          ...prev,
          {
            id: data.id,
            text: data.message,
            sender: { username: data.sender },
            timestamp: new Date().toISOString(),
          },
        ]);
      } else if (data.type === "deleteMessage") {
        setMessages((prev) => prev.filter((msg) => msg.id !== data.messageId));
      } else if (data.type === "user_typing" && data.sender !== user.username) {
        setIsOtherUserTyping(true);
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(
          () => setIsOtherUserTyping(false),
          3000
        );
      } else if (
        data.type === "user_stopped_typing" &&
        data.sender !== user.username
      ) {
        setIsOtherUserTyping(false);
      }
    };

    socket.current.onerror = (error) =>
      console.error("WebSocket error:", error);
    socket.current.onclose = () => console.log("WebSocket connection closed.");

    return () => {
      socket.current?.close();
      clearTimeout(typingTimeoutRef.current);
    };
  }, [conversation.id]);

  const handleSendMessage = async (newMessage, attachedFile, previewImage) => {
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
      socket.current?.send(
        JSON.stringify({
          type: "chat",
          id: savedMessage.id,
          message: savedMessage.text,
          sender: user.username,
          senderId: user.user_id,
        })
      );
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
    }
  };

  const handleTyping = () => {
    socket.current?.send(
      JSON.stringify({ type: "user_typing", sender: user.username })
    );
  };

  const handleStopTyping = () => {
    socket.current?.send(
      JSON.stringify({ type: "user_stopped_typing", sender: user.username })
    );
  };

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

  return (
    <div className="flex flex-col h-screen overflow-y-hidden">
      <ChatHeader conversation={conversation} />
      <Conversation
        messages={messages}
        userId={user.username}
        onDeleteMessage={handleDeleteMessage}
      />
      {isOtherUserTyping && (
        <div className="text-gray-500 text-sm p-2">
          The other user is typing...
        </div>
      )}
      <MessageInput
        onSendMessage={handleSendMessage}
        onTyping={handleTyping}
        onStopTyping={handleStopTyping}
      />
    </div>
  );
};

export default ChatRoom;
