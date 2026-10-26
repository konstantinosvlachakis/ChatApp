import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import api, { getErrorMessage, isAbortError } from "../../../lib/api";
import { logger } from "../../../lib/logger";
import ChatRoom from "./ChatRoom";
import CoachChatRoom from "./CoachChatRoom";
import { COACH_CONVERSATION_ID } from "./coachConversation";

const ChatRoomWrapper = ({ onConversationTypingChange }) => {
  const { id } = useParams(); // ✅ Extract conversation ID from URL
  const [conversation, setConversation] = useState(null);
  const [error, setError] = useState(null);
  const isCoachConversation = id === COACH_CONVERSATION_ID;

  useEffect(() => {
    if (isCoachConversation) return undefined;
    const controller = new AbortController();
    const fetchConversation = async () => {
      try {
        const data = await api.get(`/api/conversations/${id}/`, { signal: controller.signal });
        setError(null);
        setConversation(data);
      } catch (err) {
        if (isAbortError(err)) return;
        logger.warn("Error fetching conversation:", err);
        setError(getErrorMessage(err, "Failed to load the conversation."));
      }
    };

    fetchConversation();
    return () => controller.abort();
  }, [id, isCoachConversation]);

  // The read receipt is sent once by ChatRoom after the conversation has loaded.

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

export default React.memo(ChatRoomWrapper);
