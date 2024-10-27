// src/components/Sidebar.js
import React from 'react';
import ConversationList from './ConversationList';

function Sidebar() {
  return (
    <div className="w-80 h-screen bg-gray-100 flex flex-col p-4 shadow-lg">
      <input
        type="text"
        placeholder="Search"
        className="p-2 mb-4 rounded-full border border-gray-300 outline-none focus:ring-2 focus:ring-indigo-400"
      />
      <ConversationList />
    </div>
  );
}

export default Sidebar;
