import React, { useState, useRef, useEffect } from "react";
import ChatHeader from "./ChatHeader";
import Conversation from "./Conversation";
import MessageInput from "./MessageInput";
import axios from "axios";
import { deleteMessage } from "../api/deleteMessage";
import { BASE_URL } from "../../../constants/constants";

const ChatRoom = ({ conversation, user }) => {
  const [messages, setMessages] = useState(conversation.messages || []);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const socket = useRef(null);
  const typingTimeoutRef = useRef(null);
  // Fetch messages from the server to ensure sync
  const fetchMessages = async () => {
    try {
      const response = await axios.get(
        BASE_URL + `/api/conversations/${conversation.id}/messages/`,
        {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem("accessToken")}`,
          },
        }
      );
      setMessages(response.data);
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  useEffect(() => {
    // Fetch messages when the component loads
    fetchMessages();

    // Initialize WebSocket connection
    const roomName = conversation.id; // Use the appropriate value for room name
    const url = `ws://localhost:8000/ws/socket-server/${roomName}/`;
    socket.current = new WebSocket(url);

    socket.current.onopen = () => {
      console.log("WebSocket connection established.");
    };

    socket.current.onmessage = (e) => {
      const data = JSON.parse(e.data);
      console.log("WebSocket message received:", data);

      if (data.type === "chat") {
        // Check if the message is from the current user
        if (data.senderId === user.user_id) {
          console.log("Ignoring message sent by self.");
          return; // Ignore messages sent by the current user
        }
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            id: data.id,
            text: data.message,
            sender: { username: data.sender },
            timestamp: new Date().toISOString(),
          },
        ]);
      } else if (data.type === "user_typing") {
        if (data.sender !== user.username) {
          setIsOtherUserTyping(true);

          // Hide typing indicator after 3 seconds of no updates
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          typingTimeoutRef.current = setTimeout(() => {
            setIsOtherUserTyping(false);
          }, 3000);
        }
      } else if (data.type === "user_stopped_typing") {
        if (data.sender !== user.username) {
          setIsOtherUserTyping(false);
        }
      }
    };

    socket.current.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    socket.current.onclose = () => {
      console.log("WebSocket connection closed.");
    };

    // Cleanup WebSocket connection
    return () => {
      socket.current.close();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [conversation.id, user.username]);

  const handleSendMessage = async (newMessage, attachedFile, previewImage) => {
    const formData = new FormData();
    if (newMessage.trim()) {
      formData.append("text", newMessage);
    }
    if (attachedFile) {
      formData.append("attachment", attachedFile);
    }

    const tempMessage = {
      id: Date.now(),
      text: newMessage.trim() || null,
      sender: { id: user.user_id, username: user.username },
      timestamp: new Date().toISOString(),
      attachment: null,
      attachmentUrl: previewImage || null,
    };

    setMessages((prevMessages) => [...prevMessages, tempMessage]);

    try {
      const response = await axios.post(
        BASE_URL + `/api/conversations/${conversation.id}/messages/`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem("accessToken")}`,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      const savedMessage = response.data;

      // Emit the message to other users via WebSocket
      socket.current.send(
        JSON.stringify({
          type: "chat",
          id: savedMessage.id,
          message: savedMessage.text,
          sender: user.username,
          senderId: user.user_id, // Optional: Include sender ID for clarity
        })
      );
      console.log("WebSocket message sent:", {
        type: "chat",
        id: savedMessage.id,
        message: savedMessage.text,
        sender: user.username,
      });
    } catch (error) {
      console.error("Error sending message:", error);
      // Remove the temporary message in case of error
      setMessages((prevMessages) =>
        prevMessages.filter((msg) => msg.id !== tempMessage.id)
      );
    }
  };

  const handleTyping = () => {
    socket.current.send(
      JSON.stringify({
        type: "user_typing",
        sender: user.username,
      })
    );
  };

  const handleStopTyping = () => {
    socket.current.send(
      JSON.stringify({
        type: "user_stopped_typing",
        sender: user.username,
      })
    );
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
      <Conversation
        messages={messages}
        userId={user.user_id}
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
