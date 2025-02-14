import { useState } from "react";
import Sidebar from "./features/Sidebar";
import ChatRoom from "./features/ChatRoom";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useUser } from "../../context/UserContext";
const ConversationsPage = () => {
  const user = useUser();

  const [activeConversation, setActiveConversation] = useState(null);

  return (
    <div className="flex">
      {/* Sidebar Component */}
      <Sidebar
        onSelectConversation={setActiveConversation}
        activeConversationId={activeConversation?.id ?? null}
      />

      {/* Main Content */}
      <div className="flex-1 relative p-6">
        {activeConversation ? (
          <div className="flex flex-col h-full">
            <div className="absolute top-4 right-4">
              <IconButton
                color="primary"
                aria-label="Back to Profile"
                onClick={() => setActiveConversation(null)}
              >
                <ArrowBackIcon />
              </IconButton>
            </div>
            <ChatRoom conversation={activeConversation} user={user} />
          </div>
        ) : (
          <div className="text-center text-gray-500">
            Select a conversation to start chatting.
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationsPage;
