import React, { useState, useRef, useEffect, useCallback } from "react";
import ChatHeader from "./ChatHeader";
import Conversation from "./Conversation";
import MessageInput from "./MessageInput";
import TypingDots from "./TypingDots";
import axios from "axios";
import { deleteMessage } from "../api/deleteMessage";
import { BASE_URL } from "../../../constants/constants";
import { useUser } from "../../../context/UserContext";

const ChatRoom = ({ conversation, onConversationTypingChange }) => {
  const [messages, setMessages] = useState(conversation.messages || []);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const socket = useRef(null);
  const messagesContainerRef = useRef(null);
  const { user, loading } = useUser();
  const sendSocketEvent = useCallback((payload) => {
    if (!socket.current || socket.current.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.current.send(JSON.stringify(payload));
    return true;
  }, []);

  useEffect(() => {
    setMessages(conversation?.messages || []);
  }, [conversation?.id, conversation?.messages]);

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    messagesContainerRef.current.scrollTop =
      messagesContainerRef.current.scrollHeight;
  }, [messages, conversation?.id]);

  // ------------------- WebSocket Setup -------------------
  useEffect(() => {
    if (!conversation?.id || !user) return;

    const token = sessionStorage.getItem("accessToken");
    const wsBaseUrl = BASE_URL.replace(/^http/, "ws");
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    const url = `${wsBaseUrl}/ws/socket-server/${conversation.id}/${query}`;
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
                translated_text: null,
                translated_source_language: null,
                can_translate: Boolean((data.message || "").trim()),
              },
            ]);
            break;

          case "deleteMessage":
            setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
            break;

          case "user_typing":
            setIsOtherUserTyping(true);
            onConversationTypingChange?.(conversation.id, true);
            break;

          case "user_stopped_typing":
            setIsOtherUserTyping(false);
            onConversationTypingChange?.(conversation.id, false);
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
      sendSocketEvent({ type: "user_stopped_typing", sender: user.username });
      socket.current?.close();
      onConversationTypingChange?.(conversation.id, false);
    };
  }, [conversation?.id, user, onConversationTypingChange]);

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
      const sent = sendSocketEvent({
        type: "chat",
        id: savedMessage.id,
        message: savedMessage.text,
        sender: user.username,
        senderId: user.user_id,
        attachmentUrl:
          savedMessage.attachment_url || savedMessage.attachmentUrl || null,
      });
      if (!sent) {
        console.error("WebSocket is not open. Unable to send message.");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
    }
  };

  // ------------------- Typing Indicators -------------------
  const handleTyping = () => {
    sendSocketEvent({ type: "user_typing", sender: user.username });
  };

  const handleStopTyping = () => {
    sendSocketEvent({ type: "user_stopped_typing", sender: user.username });
  };

  // ------------------- Delete Message -------------------
  const handleDeleteMessage = async (messageId) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));

    try {
      await deleteMessage(messageId);
      sendSocketEvent({ type: "deleteMessage", messageId });
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
  };

  // ------------------- Render -------------------
  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0">
        <ChatHeader conversation={conversation} />
      </div>

      {/* Conversation */}
      <div
        ref={messagesContainerRef}
        className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4"
      >
        <Conversation
          messages={messages}
          userId={user.user_id}
          onDeleteMessage={handleDeleteMessage}
          baseTranslateLanguage={
            user.base_translate_language || user.native_language || "english"
          }
        />
      </div>

      {/* Typing indicator */}
      {isOtherUserTyping && (
        <div className="flex items-center gap-2 px-3 py-1 text-sm text-gray-500 sm:px-4">
          <TypingDots />
          <span>Typing...</span>
        </div>
      )}

      {/* Message input */}
      <div className="flex-shrink-0 border-t bg-white">
        <MessageInput
          onSendMessage={handleSendMessage}
          onTyping={handleTyping}
          onStopTyping={handleStopTyping}
        />
      </div>
    </div>
  );
};

export default ChatRoom;
