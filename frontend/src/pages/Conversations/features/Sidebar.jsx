import React from "react";
import ConversationList from "../features/ConversationList";

function Sidebar({ onSelectConversation, activeConversationId }) {
  return (
    <div className="w-1/4 h-screen bg-white shadow-lg border-r flex flex-col">
      {/* Search Input */}
      <div className="p-4 border-b">
        <input
          type="text"
          placeholder="Search"
          className="w-full p-2 rounded-full border border-gray-300 outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        <ConversationList
          onSelectConversation={onSelectConversation}
          activeConversationId={activeConversationId}
        />
      </div>
    </div>
  );
}

export default Sidebar;
