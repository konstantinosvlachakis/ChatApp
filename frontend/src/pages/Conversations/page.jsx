import { useCallback, useState } from "react";
import Sidebar from "./features/Sidebar";
import ChatRoom from "./features/ChatRoom";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
const ConversationsPage = () => {
  const [activeConversation, setActiveConversation] = useState(null);
  const [typingByConversation, setTypingByConversation] = useState({});

  const handleConversationTypingChange = useCallback((conversationId, isTyping) => {
    setTypingByConversation((prev) => ({
      ...prev,
      [conversationId]: isTyping,
    }));
  }, []);

  return (
    <div className="flex h-[calc(100dvh-64px)] min-h-0 w-full overflow-x-hidden sm:h-[calc(100dvh-112px)]">
      <div
        className={`min-h-0 w-full border-r bg-white md:w-[340px] lg:w-[380px] ${
          activeConversation ? "hidden md:block" : "block"
        }`}
      >
        <Sidebar
          onSelectConversation={setActiveConversation}
          activeConversationId={activeConversation?.id ?? null}
          typingByConversation={typingByConversation}
        />
      </div>

      {/* Main Content */}
      <div
        className={`relative min-h-0 flex-1 ${activeConversation ? "block" : "hidden md:block"}`}
      >
        {activeConversation ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="absolute right-2 top-2 z-20 md:hidden">
              <IconButton
                size="small"
                color="primary"
                aria-label="Back to conversations"
                onClick={() => setActiveConversation(null)}
              >
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            </div>
            <ChatRoom
              conversation={activeConversation}
              onConversationTypingChange={handleConversationTypingChange}
            />
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">
            Select a conversation to start chatting.
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationsPage;
