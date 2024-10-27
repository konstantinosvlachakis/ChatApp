// src/components/ConversationItem.js
import React from 'react';

function ConversationItem({ conversation }) {
  const { name, lastMessage, timestamp, profilePicture, unreadCount } = conversation;

  return (
    <div className="flex items-center p-2 border-b border-gray-200 hover:bg-gray-200 cursor-pointer">
      <img src={profilePicture} alt="Profile" className="w-10 h-10 rounded-full mr-3" />
      <div className="flex-1">
        <div className="flex justify-between mb-1">
          <span className="font-semibold text-gray-900">{name}</span>
          <span className="text-xs text-gray-500">{timestamp}</span>
        </div>
        <div className="text-sm text-gray-700 truncate">{lastMessage}</div>
      </div>
      {unreadCount > 0 && (
        <span className="ml-3 bg-blue-500 text-white text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center">
          {unreadCount}
        </span>
      )}
    </div>
  );
}

export default ConversationItem;
