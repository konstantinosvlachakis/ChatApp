import React, { useState } from "react";
import EmojiPicker from "emoji-picker-react";
import SettingsVoiceIcon from "@mui/icons-material/SettingsVoice";
import SendIcon from "@mui/icons-material/Send";
import EmojiEmotionsIcon from "@mui/icons-material/EmojiEmotions";

const ChatRoom = ({ conversation }) => {
  const [message, setMessage] = useState(""); // State for the message input
  const [showEmojiPicker, setShowEmojiPicker] = useState(false); // State to toggle emoji picker

  // Handle emoji selection
  const onEmojiClick = (event, emojiObject) => {
    setMessage((prev) => prev + emojiObject.emoji); // Append emoji to the input
    setShowEmojiPicker(false); // Close the picker after selection
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
          conversation.messages.map((message, index) => (
            <div
              key={index}
              className={`max-w-fit px-4 py-2 mb-2 rounded-full ${
                message.isSentByUser
                  ? "bg-blue-100 self-end"
                  : "bg-gray-200 self-start"
              }`}
              style={{
                display: "inline-block", // Dynamically size the bubble to the text
              }}
            >
              {message.text}
            </div>
          ))
        ) : (
          <div className="text-gray-500">No messages yet!</div>
        )}
      </div>

      {/* Message Input with Icons */}
      <div className="p-4 border-t bg-white flex items-center relative">
        {/* Emoji Picker Icon */}
        <div className="relative">
          <EmojiEmotionsIcon
            className="text-gray-500 cursor-pointer mr-3"
            onClick={() => setShowEmojiPicker((prev) => !prev)} // Toggle emoji picker
          />
          {showEmojiPicker && (
            <div className="absolute bottom-10 left-0 z-50">
              <EmojiPicker onEmojiClick={onEmojiClick} />
            </div>
          )}
        </div>

        {/* Input Field with Microphone */}
        <div className="relative flex items-center w-1/2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
            className="w-full p-2 border border-gray-300 rounded-lg pr-10"
          />
          <SettingsVoiceIcon className="absolute right-3 text-gray-500 cursor-pointer" />
        </div>

        {/* Send Button */}
        <button
          type="button"
          className="bg-blue-500 text-white p-2 rounded-lg ml-3 flex items-center justify-center"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
};

export default ChatRoom;
