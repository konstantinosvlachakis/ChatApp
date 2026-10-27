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
    // A previous chat's error must not stick to this one; a previous chat's detail is
    // ignored below (currentConversation) until this id's detail arrives.
    setError(null);
    let isCurrent = true;
    const controller = new AbortController();
    const fetchConversation = async () => {
      try {
        const data = await api.get(`/api/conversations/${id}/`, { signal: controller.signal });
        if (!isCurrent) return;
        setError(null);
        setConversation(data);
      } catch (err) {
        if (!isCurrent || isAbortError(err)) return;
        logger.warn("Error fetching conversation:", err);
        setError(getErrorMessage(err, "Failed to load the conversation."));
      }
    };

    fetchConversation();
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [id, isCoachConversation]);

  // Only the detail for the id in the URL is shown: while B loads after A, the header,
  // messages and composer must not still be A's (Enter would post to A).
  const currentConversation =
    conversation && String(conversation.id) === String(id) ? conversation : null;

  // The read receipt is sent once by ChatRoom after the conversation has loaded.

  if (isCoachConversation) {
    return (
      <div className="h-full min-h-0">
        <CoachChatRoom onConversationTypingChange={onConversationTypingChange} />
      </div>
    );
  }

  if (error) return <p className="cv-chat-status is-error" role="alert">{error}</p>;
  if (!currentConversation) {
    return <p className="cv-chat-status" role="status">Loading chat…</p>;
  }

  return (
    <div className="h-full min-h-0">
      {/* Keyed so each conversation gets fresh state (history, search, composer draft). */}
      <ChatRoom
        key={currentConversation.id}
        conversation={currentConversation}
        onConversationTypingChange={onConversationTypingChange}
      />
    </div>
  );
};

export default React.memo(ChatRoomWrapper);
