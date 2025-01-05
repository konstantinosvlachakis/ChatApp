import React, { useState } from "react";
import { EmojiPickerWrapper } from "./EmojuPickerWrapper";

const ChatRoom = ({ conversation }) => {
  const [message, setMessage] = useState(""); // State for the message input
  const [showPicker, setShowPicker] = useState(false); // Toggle for emoji picker

  // Handle emoji selection
  const handleEmojiSelect = (emoji) => {
    console.log("Selected emoji:", emoji);
    setMessage((prev) => prev + emoji); // Append emoji to the input field
  };

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
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50 flex flex-col">
        {conversation.messages?.length > 0 ? (
          conversation.messages.map((msg, index) => (
            <div
              key={index}
              className={`max-w-fit px-4 py-2 mb-2 rounded-full ${
                msg.isSentByUser
                  ? "bg-blue-100 self-end"
                  : "bg-gray-200 self-start"
              }`}
            >
              {msg.text}
            </div>
          ))
        ) : (
          <div className="text-gray-500">No messages yet!</div>
        )}
      </div>

      {/* Message Input */}
      <div className="p-4 border-t bg-white flex items-center relative">
        {/* Emoji Picker Toggle */}
        <button onClick={() => setShowPicker((prev) => !prev)} className="mr-2">
          😊
        </button>

        {/* Emoji Picker */}
        {showPicker && (
          <div className="absolute bottom-16 left-0 z-50">
            <EmojiPickerWrapper onEmojiSelect={handleEmojiSelect} />
          </div>
        )}

        {/* Input Field */}
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 p-2 border border-gray-300 rounded-lg"
        />
        <button
          type="button"
          className="bg-blue-500 text-white p-2 rounded-lg ml-3"
          onClick={() => {
            if (message.trim() === "") return; // Avoid sending empty messages
            console.log("Message sent:", message);
            setMessage(""); // Clear the input after sending
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatRoom;
