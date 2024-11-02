// src/components/Sidebar.jsx
import React from "react";
import ConversationList from "./ConversationList"; // Adjust the path based on your project structure

function Sidebar({ onSelectConversation }) {
  return (
    <div className="w-80 h-screen bg-gray-100 flex flex-col p-4 shadow-lg">
      <input
        type="text"
        placeholder="Search"
        className="p-2 mb-4 rounded-full border border-gray-300 outline-none focus:ring-2 focus:ring-indigo-400"
      />
      <ConversationList onSelectConversation={onSelectConversation} />
    </div>
  );
}

export default Sidebar;
