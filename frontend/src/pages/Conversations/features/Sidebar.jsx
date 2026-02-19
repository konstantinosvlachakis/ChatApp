import React from "react";
import { useNavigate } from "react-router-dom";
import ConversationList from "../features/ConversationList";

function Sidebar({ onSelectConversation, activeConversationId }) {
  const navigate = useNavigate();

  return (
    <div className="w-1/4 h-screen bg-white shadow-lg border-r flex flex-col">
      {/* Search Input */}
      <div className="p-4 border-b">
        <input
          type="text"
          placeholder="Search"
          className="w-full p-2 rounded-full border border-gray-300 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => navigate("/chatbot")}
          className="mt-3 w-full p-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition"
        >
          Open Language Chatbot
        </button>
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
