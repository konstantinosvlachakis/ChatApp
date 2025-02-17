import React, { useState, useRef } from "react";
import { EmojiPickerWrapper } from "./EmojiPickerWrapper";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import SendIcon from "@mui/icons-material/Send";
import SettingsVoiceIcon from "@mui/icons-material/SettingsVoice";

const MessageInput = ({ onSendMessage, currentUser, onMessageReceived }) => {
  const [message, setMessage] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [attachedFile, setAttachedFile] = useState(null);
  const emojiPickerRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleEmojiSelect = (emoji) => setMessage((prev) => prev + emoji);

  const handleFileAttach = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      const imageUrl = URL.createObjectURL(file); // Generate preview URL
      setPreviewImage(imageUrl); // Set the preview image
      setAttachedFile(file); // Store the file for sending
    } else {
      alert("Please select a valid image or video file.");
    }
    fileInputRef.current.value = null; // Reset input for re-selection
  };

  const handleSend = () => {
    if (!message.trim() && !attachedFile) {
      alert("Please enter a message or attach a file.");
      return;
    }

    onSendMessage(message, attachedFile, previewImage); // Send message
    setMessage(""); // Clear message input
    if (previewImage) URL.revokeObjectURL(previewImage); // Cleanup Blob URL
    setPreviewImage(null);
    setAttachedFile(null);
  };

  return (
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
        <div className="flex items-center w-full p-2 border border-gray-300 rounded-lg">
          {previewImage && (
            <div className="flex items-center space-x-2">
              <img
                src={previewImage} // Display the preview image
                alt="Preview"
                className="h-10 w-10 object-cover rounded"
              />
              <button
                onClick={() => {
                  if (previewImage) URL.revokeObjectURL(previewImage); // Cleanup
                  setPreviewImage(null);
                  setAttachedFile(null);
                }}
                className="text-red-500 text-sm"
              >
                ✕
              </button>
            </div>
          )}
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
            className="w-full outline-none"
          />
        </div>
        <AttachFileIcon
          className="absolute right-10 text-gray-500 cursor-pointer"
          onClick={() => fileInputRef.current.click()}
        />
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileAttach}
        />
        <SettingsVoiceIcon className="absolute right-2 text-gray-500 cursor-pointer" />
      </div>
      <button type="button" className="ml-3 text-blue-500" onClick={handleSend}>
        <SendIcon />
      </button>
    </div>
  );
};

export default MessageInput;
