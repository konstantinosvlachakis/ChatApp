import React from "react";
import { conversations } from "../data/conversations";

function ConversationList({ onSelectConversation, activeConversationId }) {
  return (
    <div className="overflow-y-auto">
      {conversations.map((conversation) => (
        <div
          key={conversation.id}
          className={`flex items-center p-2 cursor-pointer ${
            activeConversationId === conversation.id
              ? "bg-gray-300"
              : "hover:bg-gray-200"
          }`}
          onClick={() => onSelectConversation(conversation)}
        >
          <img
            src={conversation.profilePicture}
            alt={conversation.name}
            className="w-12 h-12 rounded-full mr-3"
          />
          <div className="flex-1">
            <p className="font-semibold">{conversation.name}</p>
            <p className="text-sm text-gray-500">
              {conversation.lastMessage}{" "}
              <span className="text-gray-400">({conversation.timestamp})</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ConversationList;
