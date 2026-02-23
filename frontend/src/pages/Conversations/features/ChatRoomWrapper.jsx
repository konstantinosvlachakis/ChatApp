import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import ChatRoom from "./ChatRoom";
import { BASE_URL } from "../../../constants/constants";

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
              Authorization: `Bearer ${sessionStorage.getItem("accessToken")}`, // ✅ Ensure auth header is correct
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

  if (error) return <div className="p-4 text-red-500">{error}</div>;
  if (!conversation) return <div className="p-4 text-gray-500">Loading chat...</div>;

  return <ChatRoom conversation={conversation} />;
};

export default ChatRoomWrapper;
