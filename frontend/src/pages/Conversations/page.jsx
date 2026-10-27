import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import Sidebar from "./features/Sidebar";
import ChatRoomWrapper from "./features/ChatRoomWrapper";
import "./conversations.css";

const noop = () => {};

const ConversationsPage = () => {
  const { id } = useParams();
  const [typingByConversation, setTypingByConversation] = useState({});
  const activeConversationId = id || null;
  const hasSelectedConversation = Boolean(activeConversationId);

  const handleConversationTypingChange = useCallback((conversationId, isTyping) => {
    // Typing events arrive often; skip the state update (and the page re-render) when the
    // flag for this conversation hasn't actually changed.
    setTypingByConversation((prev) =>
      Boolean(prev[conversationId]) === Boolean(isTyping)
        ? prev
        : {
            ...prev,
            [conversationId]: isTyping,
          }
    );
  }, []);

  return (
    <div className={`cv-page ${hasSelectedConversation ? "has-selection" : ""}`}>
      <section className="cv-panel cv-list-slot" aria-label="Conversations">
        <Sidebar
          onSelectConversation={noop}
          activeConversationId={hasSelectedConversation ? activeConversationId : null}
          typingByConversation={typingByConversation}
        />
      </section>

      <section className="cv-panel cv-chat-slot" aria-label="Chat">
        {hasSelectedConversation ? (
          <ChatRoomWrapper onConversationTypingChange={handleConversationTypingChange} />
        ) : (
          <div className="cv-empty-state">
            <span className="cv-empty-state-icon" aria-hidden="true">
              <ChatBubbleOutlineRoundedIcon />
            </span>
            <h2>Pick a conversation</h2>
            <p>Choose someone on the left to keep practising, or meet a new exchange partner.</p>
            <Link to="/community" className="cv-pill-button is-primary">
              Find people
            </Link>
          </div>
        )}
      </section>
    </div>
  );
};

export default ConversationsPage;
