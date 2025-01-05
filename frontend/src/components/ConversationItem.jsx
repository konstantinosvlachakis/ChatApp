import React, { useState } from "react";
import { conversations } from "./data"; // Import your conversations
import ConversationItem from "./ConversationItem";
import ChatRoom from "./ChatRoom";

const Conversations = () => {
  const [activeConversation, setActiveConversation] = useState(null);

  return (
    <div className="flex h-screen">
      {/* Sidebar for Conversations */}
      <div className="w-1/3 border-r">
        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            onClick={() => setActiveConversation(conversation)}
          >
            <ConversationItem conversation={conversation} />
          </div>
        ))}
      </div>

      {/* Chat Room */}
      <div className="w-2/3">
        {activeConversation && activeConversation.messages ? (
          <ChatRoom conversation={activeConversation} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500">
              Select a conversation to start chatting
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Conversations;
