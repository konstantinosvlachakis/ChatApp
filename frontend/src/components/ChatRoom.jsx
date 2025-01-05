import React, { useState, useRef, useEffect } from "react";
import { EmojiPickerWrapper } from "./EmojiPickerWrapper";
import SettingsVoiceIcon from "@mui/icons-material/SettingsVoice";
import SendIcon from "@mui/icons-material/Send";

const ChatRoom = ({ conversation }) => {
  const [message, setMessage] = useState(""); // State for the message input
  const [showPicker, setShowPicker] = useState(false); // Toggle for emoji picker
  const emojiPickerRef = useRef(null); // Ref for the emoji picker

  // Handle emoji selection
  const handleEmojiSelect = (emoji) => {
    console.log("Selected emoji:", emoji);
    setMessage((prev) => prev + emoji); // Append emoji to the input field
  };

  // Close emoji picker on outside click
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target)
      ) {
        setShowPicker(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

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
          <div ref={emojiPickerRef} className="absolute bottom-16 left-0 z-50">
            <EmojiPickerWrapper onEmojiSelect={handleEmojiSelect} />
          </div>
        )}

        {/* Input Field */}
        <div className="relative flex w-1/2 items-center">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
            className="w-full p-2 border border-gray-300 rounded-lg pr-10"
          />
          <SettingsVoiceIcon className="absolute right-2 text-gray-500 cursor-pointer" />
        </div>

        {/* Send Button */}
        <button
          type="button"
          className="ml-3 text-blue-500"
          onClick={() => {
            if (message.trim() === "") return; // Avoid sending empty messages
            console.log("Message sent:", message);
            setMessage(""); // Clear the input after sending
          }}
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
};

export default ChatRoom;
