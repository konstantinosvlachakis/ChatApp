import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "../../../utils/axios";
import ChatRoom from "./ChatRoom";
import CoachChatRoom from "./CoachChatRoom";
import { BASE_URL } from "../../../constants/constants";
import { markConversationRead } from "../api/markConversationRead";
import { COACH_CONVERSATION_ID } from "./coachConversation";

const ChatRoomWrapper = ({ onConversationTypingChange }) => {
  const { id } = useParams(); // ✅ Extract conversation ID from URL
  const [conversation, setConversation] = useState(null);
  const [error, setError] = useState(null);
  const isCoachConversation = id === COACH_CONVERSATION_ID;

  useEffect(() => {
    if (isCoachConversation) return;
    const fetchConversation = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/api/conversations/${id}/`, {
          withCredentials: true,
          headers: {
            "Content-Type": "application/json",
          },
        });

        setConversation(response.data);
      } catch (err) {
        console.error("Error fetching conversation:", err);
        setError("Failed to load the conversation.");
      }
    };

    fetchConversation();
  }, [id, isCoachConversation]);

  useEffect(() => {
    if (!id || isCoachConversation) return;
    markConversationRead(id).catch(() => {});
  }, [id, isCoachConversation]);

  if (isCoachConversation) {
    return (
      <div className="h-full min-h-0">
        <CoachChatRoom onConversationTypingChange={onConversationTypingChange} />
      </div>
    );
  }

  if (error) return <div className="h-full p-4 text-red-500">{error}</div>;
  if (!conversation) return <div className="h-full p-4 text-gray-500">Loading chat...</div>;

  return (
    <div className="h-full min-h-0">
      <ChatRoom
        conversation={conversation}
        onConversationTypingChange={onConversationTypingChange}
      />
    </div>
  );
};

export default ChatRoomWrapper;
