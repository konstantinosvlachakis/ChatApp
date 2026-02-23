import React from "react";
import ConversationList from "../features/ConversationList";

function Sidebar({
  onSelectConversation,
  activeConversationId,
  typingByConversation,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* Search Input */}
      <div className="border-b p-3 sm:p-4">
        <input
          type="text"
          placeholder="Search"
          className="w-full rounded-full border border-gray-300 p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Conversation List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ConversationList
          onSelectConversation={onSelectConversation}
          activeConversationId={activeConversationId}
          typingByConversation={typingByConversation}
        />
      </div>
    </div>
  );
}

export default Sidebar;
