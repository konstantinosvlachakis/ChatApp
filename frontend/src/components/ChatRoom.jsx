import React from "react";

const ChatRoom = ({ conversation }) => {
  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="p-4 border-b bg-white flex items-center">
        <img
          src={conversation.profilePicture}
          alt={conversation.name}
          className="w-10 h-10 rounded-full mr-3"
        />
        <h2 className="font-semibold text-lg">{conversation.name}</h2>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        {conversation.messages?.length > 0 ? (
          conversation.messages.map((message, index) => (
            <div
              key={index}
              className={`p-2 mb-2 rounded ${
                message.isSentByUser
                  ? "bg-blue-100 self-end"
                  : "bg-gray-200 self-start"
              }`}
            >
              {message.text}
            </div>
          ))
        ) : (
          <div className="text-gray-500">No messages yet!</div>
        )}
      </div>

      {/* Message Input */}
      <div className="p-4 border-t bg-white">
        <input
          type="text"
          placeholder="Type your message..."
          className="w-full p-2 border border-gray-300 rounded"
        />
      </div>
    </div>
  );
};

export default ChatRoom;
