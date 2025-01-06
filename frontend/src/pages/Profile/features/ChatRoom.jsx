import React, { useState, useRef, useEffect } from "react";
import { EmojiPickerWrapper } from "./EmojiPickerWrapper";
import SettingsVoiceIcon from "@mui/icons-material/SettingsVoice";
import SendIcon from "@mui/icons-material/Send";

const ChatRoom = ({ conversation }) => {
  const [messages, setMessages] = useState(conversation.messages || []); // Use all messages
  const [message, setMessage] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const emojiPickerRef = useRef(null);

  const handleEmojiSelect = (emoji) => {
    setMessage((prev) => prev + emoji);
  };

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

  const handleSendMessage = () => {
    if (message.trim() === "") return;

    const newMessage = {
      id: messages.length + 1,
      text: message,
      isSentByUser: true,
    };

    setMessages((prevMessages) => [...prevMessages, newMessage]);
    setMessage("");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b bg-white flex items-center">
        <img
          src={conversation.receiver.profile_image_url}
          alt={conversation.receiver.username}
          className="w-10 h-10 rounded-full mr-3"
        />
        <h2 className="font-semibold text-lg">
          {conversation.receiver.username}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-gray-50 flex flex-col">
        {messages.length > 0 ? (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`max-w-fit px-4 py-2 mb-2 rounded-full ${
                msg.sender?.id === conversation.sender.id
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

      <div className="p-4 border-t bg-white flex items-center relative">
        <button onClick={() => setShowPicker((prev) => !prev)} className="mr-2">
          😊
        </button>

        {showPicker && (
          <div ref={emojiPickerRef} className="absolute bottom-16 left-0 z-50">
            <EmojiPickerWrapper onEmojiSelect={handleEmojiSelect} />
          </div>
        )}

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

        <button
          type="button"
          className="ml-3 text-blue-500"
          onClick={handleSendMessage}
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
};

export default ChatRoom;
