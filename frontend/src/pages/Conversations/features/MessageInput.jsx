import React, { useState, useRef, useEffect } from "react";
import { EmojiPickerWrapper } from "./EmojiPickerWrapper";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import SendIcon from "@mui/icons-material/Send";
import SettingsVoiceIcon from "@mui/icons-material/SettingsVoice";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const MessageInput = ({
  onSendMessage,
  onTyping,
  onStopTyping,
  conversationId,
  connectionStatus = "connected",
}) => {
  const draftStorageKey = conversationId
    ? `chat:draft:${conversationId}`
    : "chat:draft:global";
  const [message, setMessage] = useState(() => localStorage.getItem(draftStorageKey) || "");
  const [showPicker, setShowPicker] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [attachedFile, setAttachedFile] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [composerError, setComposerError] = useState("");

  const emojiPickerRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const isTypingRef = useRef(false);
  const hasInitializedTypingRef = useRef(false);
  const previousConnectionStatusRef = useRef(connectionStatus);
  const onTypingRef = useRef(onTyping);
  const onStopTypingRef = useRef(onStopTyping);

  useEffect(() => {
    onTypingRef.current = onTyping;
  }, [onTyping]);

  useEffect(() => {
    onStopTypingRef.current = onStopTyping;
  }, [onStopTyping]);

  useEffect(() => {
    setMessage(localStorage.getItem(draftStorageKey) || "");
  }, [draftStorageKey]);

  useEffect(() => {
    if (message.trim()) {
      localStorage.setItem(draftStorageKey, message);
      return;
    }
    localStorage.removeItem(draftStorageKey);
  }, [draftStorageKey, message]);

  useEffect(() => {
    const hasContent = Boolean(message.trim());

    if (!hasInitializedTypingRef.current) {
      hasInitializedTypingRef.current = true;
      isTypingRef.current = hasContent;
      if (hasContent) {
        onTypingRef.current?.();
      }
      return;
    }

    if (hasContent && !isTypingRef.current) {
      onTypingRef.current?.();
      isTypingRef.current = true;
      return;
    }

    if (!hasContent && isTypingRef.current) {
      onStopTypingRef.current?.();
      isTypingRef.current = false;
    }
  }, [message]);

  useEffect(() => {
    const hadPreviousConnection = previousConnectionStatusRef.current;
    previousConnectionStatusRef.current = connectionStatus;

    if (
      connectionStatus === "connected" &&
      hadPreviousConnection !== "connected" &&
      message.trim() &&
      isTypingRef.current
    ) {
      onTypingRef.current?.();
    }
  }, [connectionStatus, message]);

  // ---------------- Emoji Picker ----------------
  const handleEmojiSelect = (emoji) => {
    setMessage((prev) => `${prev}${emoji}`);
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
    setComposerError("");

    if (file.size > MAX_UPLOAD_BYTES) {
      setComposerError("Files must be smaller than 25 MB.");
      fileInputRef.current.value = null;
      return;
    }

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
      setComposerError("Select an image, video, or audio file.");
    }
    fileInputRef.current.value = null;
  };

  // ---------------- Audio Recording ----------------
  const handleStartRecording = async () => {
    setComposerError("");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setComposerError("Audio recording is not supported in this browser.");
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
      setComposerError("Unable to access the microphone.");
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
    setComposerError("");
    if (!message.trim() && !attachedFile && !audioBlob) {
      setComposerError("Write a message or attach a file first.");
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
    localStorage.removeItem(draftStorageKey);
    setPreviewImage(null);
    setAttachedFile(null);
    setAudioBlob(null);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setComposerError("");
    setMessage(value);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative m-2 rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-[0_10px_26px_-20px_rgba(15,23,42,0.55)] backdrop-blur sm:m-3 sm:p-3">
      {showPicker && (
        <div
          ref={emojiPickerRef}
          className="absolute bottom-14 left-2 z-50 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl sm:bottom-16 sm:left-3"
        >
          <EmojiPickerWrapper onEmojiSelect={handleEmojiSelect} />
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Emoji Picker Button */}
        <button
          type="button"
          onClick={() => setShowPicker((prev) => !prev)}
          className="mb-1 rounded-full border border-slate-200 bg-white p-2 text-base shadow-sm transition hover:bg-slate-50"
          aria-label="Open emoji picker"
        >
          😊
        </button>

        <div className="flex-1 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2">
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
                    className="text-sm font-medium text-rose-500"
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
                    className="text-sm font-medium text-rose-500"
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
              className="w-full min-w-0 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 sm:text-base"
            />

            {/* File Attach */}
            <button
              type="button"
              className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100"
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
              className={`rounded-full p-1.5 transition hover:bg-slate-100 ${
                isRecording ? "text-rose-500" : "text-slate-500"
              }`}
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              aria-label={isRecording ? "Stop recording" : "Start recording"}
            >
              <SettingsVoiceIcon fontSize="small" />
            </button>
          </div>

          {(composerError || connectionStatus !== "connected") && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {composerError && (
                <span className="rounded-full bg-rose-50 px-2 py-1 font-medium text-rose-600">
                  {composerError}
                </span>
              )}
              {connectionStatus !== "connected" && (
                <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-700">
                  {connectionStatus === "reconnecting"
                    ? "Chat is reconnecting. Draft is saved."
                    : "Chat is offline. Draft is saved."}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Send Button */}
        <button
          type="button"
          className="mb-1 rounded-full bg-slate-800 p-2 text-white shadow-sm transition hover:bg-slate-700"
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
