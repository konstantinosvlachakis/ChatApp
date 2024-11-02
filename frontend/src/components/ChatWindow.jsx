// src/components/ChatWindow.jsx
import React from "react";

function ChatWindow({ conversation }) {
  return (
    <div className="p-4 flex flex-col h-full">
      {conversation ? (
        <>
          <h2 className="text-2xl font-bold mb-4">{conversation.name}</h2>
          <div className="flex-1 overflow-y-auto">
            <p>{conversation.lastMessage}</p>
            {/* Add more logic to render messages here */}
          </div>
          <div className="mt-4 flex">
            <input
              type="text"
              placeholder="Type a message..."
              className="flex-1 p-2 border rounded-l-md"
            />
            <button className="p-2 bg-blue-500 text-white rounded-r-md">
              Send
            </button>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">
            Select a conversation to start chatting.
          </p>
        </div>
      )}
    </div>
  );
}

export default ChatWindow;
