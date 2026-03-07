import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Sidebar from "./features/Sidebar";
import ChatRoomWrapper from "./features/ChatRoomWrapper";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

const ConversationsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [typingByConversation, setTypingByConversation] = useState({});
  const activeConversationId = id ? Number(id) : null;
  const hasSelectedConversation = Number.isFinite(activeConversationId);

  const handleConversationTypingChange = useCallback((conversationId, isTyping) => {
    setTypingByConversation((prev) => ({
      ...prev,
      [conversationId]: isTyping,
    }));
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full overflow-x-hidden">
      <div
        className={`min-h-0 w-full border-r bg-white md:w-[320px] lg:w-[360px] xl:w-[400px] 2xl:w-[440px] ${
          hasSelectedConversation ? "hidden md:block" : "block"
        }`}
      >
        <Sidebar
          onSelectConversation={() => {}}
          activeConversationId={hasSelectedConversation ? activeConversationId : null}
          typingByConversation={typingByConversation}
        />
      </div>

      {/* Main Content */}
      <div
        className={`relative min-h-0 flex-1 ${hasSelectedConversation ? "block" : "hidden md:block"}`}
      >
        {hasSelectedConversation ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="absolute right-2 top-2 z-20 md:hidden">
              <IconButton
                size="small"
                color="primary"
                aria-label="Back to conversations"
                onClick={() => navigate("/conversations")}
              >
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            </div>
            <ChatRoomWrapper
              onConversationTypingChange={handleConversationTypingChange}
            />
          </div>
        ) : (
          <div className="p-4 text-center text-gray-500 sm:p-6">
            Select a conversation to start chatting.
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationsPage;
