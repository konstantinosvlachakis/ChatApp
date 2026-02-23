import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import ChatRoom from "./ChatRoom";
import { BASE_URL } from "../../../constants/constants";
import { markConversationRead } from "../api/markConversationRead";

const ChatRoomWrapper = () => {
  const { id } = useParams(); // ✅ Extract conversation ID from URL
  const [conversation, setConversation] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    const fetchConversation = async () => {
      try {
        const response = await axios.get(
          `${BASE_URL}/api/conversations/${id}/`,
          {
            headers: {
              Authorization: `Bearer ${
                sessionStorage.getItem("accessToken") ||
                localStorage.getItem("accessToken")
              }`, // ✅ Ensure auth header is correct
              "Content-Type": "application/json", // ✅ No need for multipart/form-data in GET request
            },
          }
        );

        setConversation(response.data);
      } catch (err) {
        console.error("Error fetching conversation:", err);
        setError("Failed to load the conversation.");
      }
    };

    fetchConversation();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    markConversationRead(id).catch(() => {});
  }, [id]);

  if (error) return <div className="h-[calc(100dvh-64px)] p-4 text-red-500 sm:h-[calc(100dvh-112px)]">{error}</div>;
  if (!conversation) return <div className="h-[calc(100dvh-64px)] p-4 text-gray-500 sm:h-[calc(100dvh-112px)]">Loading chat...</div>;

  return (
    <div className="h-[calc(100dvh-64px)] min-h-0 sm:h-[calc(100dvh-112px)]">
      <ChatRoom conversation={conversation} />
    </div>
  );
};

export default ChatRoomWrapper;
