import React, { useState, useRef, useEffect } from "react";
import { EmojiPickerWrapper } from "./EmojiPickerWrapper";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import SendIcon from "@mui/icons-material/Send";
import SettingsVoiceIcon from "@mui/icons-material/SettingsVoice";

const MessageInput = ({ onSendMessage, onTyping, onStopTyping }) => {
  const [message, setMessage] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [attachedFile, setAttachedFile] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [isRecording, setIsRecording] = useState(false);

  const emojiPickerRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const isTypingRef = useRef(false);
  const onTypingRef = useRef(onTyping);
  const onStopTypingRef = useRef(onStopTyping);

  useEffect(() => {
    onTypingRef.current = onTyping;
  }, [onTyping]);

  useEffect(() => {
    onStopTypingRef.current = onStopTyping;
  }, [onStopTyping]);

  // ---------------- Emoji Picker ----------------
  const handleEmojiSelect = (emoji) => {
    setMessage((prev) => prev + emoji);
    setShowPicker(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ---------------- File Attach ----------------
  const handleFileAttach = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      const imageUrl = URL.createObjectURL(file);
      setPreviewImage(imageUrl);
      setAttachedFile(file);
      setAudioBlob(null); // clear audio if new file attached
    } else if (file.type.startsWith("audio/")) {
      setAttachedFile(file);
      setAudioBlob(file);
      setPreviewImage(null);
    } else {
      alert("Please select a valid image, video, or audio file.");
    }
    fileInputRef.current.value = null;
  };

  // ---------------- Audio Recording ----------------
  const handleStartRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Audio recording not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        setAudioBlob(blob);
        setAttachedFile(blob);
        setPreviewImage(null); // clear image if recording
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access error:", err);
      alert("Unable to access microphone.");
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // ---------------- Send Message ----------------
  const handleSend = () => {
    if (!message.trim() && !attachedFile && !audioBlob) {
      alert("Please enter a message or attach a file.");
      return;
    }

    const formData = new FormData();
    if (message.trim()) formData.append("text", message);

    if (attachedFile) {
      // If it's an audio blob, give it a filename and type
      if (attachedFile instanceof Blob && attachedFile.type.startsWith("audio/")) {
        const file = new File([attachedFile], `recording_${Date.now()}.webm`, {
          type: attachedFile.type || "audio/webm",
        });
        formData.append("attachment", file);
      } else {
        formData.append("attachment", attachedFile);
      }
    }

    onSendMessage(message, attachedFile, previewImage);
    if (isTypingRef.current) {
      onStopTypingRef.current?.();
      isTypingRef.current = false;
    }
    setMessage("");
    setPreviewImage(null);
    setAttachedFile(null);
    setAudioBlob(null);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setMessage(value);

    if (!value.trim()) {
      if (isTypingRef.current) {
        onStopTypingRef.current?.();
        isTypingRef.current = false;
      }
      return;
    }

    if (!isTypingRef.current) {
      onTypingRef.current?.();
      isTypingRef.current = true;
    }
  };

  useEffect(() => {
    return () => {
      if (isTypingRef.current) {
        onStopTypingRef.current?.();
        isTypingRef.current = false;
      }
    };
  }, []);


  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative border-t bg-white p-2 sm:p-3">
      {showPicker && (
        <div ref={emojiPickerRef} className="absolute bottom-14 left-2 z-50 sm:bottom-16 sm:left-3">
          <EmojiPickerWrapper onEmojiSelect={handleEmojiSelect} />
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Emoji Picker Button */}
        <button
          type="button"
          onClick={() => setShowPicker((prev) => !prev)}
          className="mb-1 rounded-full p-2 text-base transition hover:bg-gray-100"
          aria-label="Open emoji picker"
        >
          😊
        </button>

        <div className="flex-1 rounded-2xl border border-gray-300 bg-white px-3 py-2">
          {(previewImage || audioBlob) && (
            <div className="mb-2">
              {previewImage && (
                <div className="flex items-center gap-2">
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="h-10 w-10 rounded object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(previewImage);
                      setPreviewImage(null);
                      setAttachedFile(null);
                    }}
                    className="text-sm text-red-500"
                  >
                    Remove
                  </button>
                </div>
              )}

              {audioBlob && (
                <div className="flex items-center gap-2">
                  <audio controls src={URL.createObjectURL(audioBlob)} className="h-9 max-w-[180px]" />
                  <button
                    type="button"
                    onClick={() => {
                      setAudioBlob(null);
                      setAttachedFile(null);
                    }}
                    className="text-sm text-red-500"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-1">
            <input
              type="text"
              ref={inputRef}
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="w-full min-w-0 bg-transparent text-sm outline-none sm:text-base"
            />

            {/* File Attach */}
            <button
              type="button"
              className="rounded-full p-1.5 text-gray-500 transition hover:bg-gray-100"
              onClick={() => fileInputRef.current.click()}
              aria-label="Attach file"
            >
              <AttachFileIcon fontSize="small" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileAttach}
            />

            {/* Voice Recording */}
            <button
              type="button"
              className={`rounded-full p-1.5 transition hover:bg-gray-100 ${
                isRecording ? "text-red-500" : "text-gray-500"
              }`}
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              aria-label={isRecording ? "Stop recording" : "Start recording"}
            >
              <SettingsVoiceIcon fontSize="small" />
            </button>
          </div>
        </div>

        {/* Send Button */}
        <button
          type="button"
          className="mb-1 rounded-full bg-blue-500 p-2 text-white transition hover:bg-blue-600"
          onClick={handleSend}
          aria-label="Send message"
        >
          <SendIcon fontSize="small" />
        </button>
      </div>
    </div>
  );
};

export default MessageInput;
