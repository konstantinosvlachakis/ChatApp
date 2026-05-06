import React, { useState, useRef, useEffect } from "react";
import { EmojiPickerWrapper } from "./EmojiPickerWrapper";
import AddReactionOutlinedIcon from "@mui/icons-material/AddReactionOutlined";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import SendIcon from "@mui/icons-material/Send";
import SettingsVoiceIcon from "@mui/icons-material/SettingsVoice";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const MessageInput = ({
  onSendMessage,
  onSaveEdit,
  onCancelEdit,
  onCancelReply,
  onTyping,
  onStopTyping,
  conversationId,
  connectionStatus = "connected",
  editingMessage = null,
  replyingMessage = null,
}) => {
  const draftStorageKey = conversationId
    ? `chat:draft:${conversationId}`
    : "chat:draft:global";
  const [message, setMessage] = useState(() => localStorage.getItem(draftStorageKey) || "");
  const [showPicker, setShowPicker] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [attachedFile, setAttachedFile] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [attachmentSource, setAttachmentSource] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [composerError, setComposerError] = useState("");

  const emojiPickerRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const isTypingRef = useRef(false);
  const hasInitializedTypingRef = useRef(false);
  const previousConnectionStatusRef = useRef(connectionStatus);
  const onTypingRef = useRef(onTyping);
  const onStopTypingRef = useRef(onStopTyping);
  const draftBeforeEditRef = useRef("");
  const previousEditingMessageIdRef = useRef(null);

  useEffect(() => {
    onTypingRef.current = onTyping;
  }, [onTyping]);

  useEffect(() => {
    onStopTypingRef.current = onStopTyping;
  }, [onStopTyping]);

  useEffect(() => {
    const previousEditingMessageId = previousEditingMessageIdRef.current;
    const currentEditingMessageId = editingMessage?.id ?? null;

    if (previousEditingMessageId === currentEditingMessageId) {
      return;
    }

    previousEditingMessageIdRef.current = currentEditingMessageId;

    if (!editingMessage) {
      setMessage(draftBeforeEditRef.current || localStorage.getItem(draftStorageKey) || "");
      draftBeforeEditRef.current = "";
      return;
    }

    draftBeforeEditRef.current = message;
    setMessage(editingMessage.text || "");
    setComposerError("");
    setShowPicker(false);
    clearCurrentAttachment();
    setIsRecording(false);
    inputRef.current?.focus();
  }, [draftStorageKey, editingMessage?.id]);

  useEffect(() => {
    setMessage(localStorage.getItem(draftStorageKey) || "");
  }, [draftStorageKey]);

  useEffect(() => {
    if (editingMessage) {
      return;
    }
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

  const revokePreviewUrl = (url) => {
    if (url?.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  };

  const clearCurrentAttachment = () => {
    revokePreviewUrl(previewImage);
    setPreviewImage(null);
    setAttachedFile(null);
    setAudioBlob(null);
    setAttachmentSource(null);
  };

  const applyVisualAttachment = (file, source = "upload") => {
    const nextPreviewUrl = URL.createObjectURL(file);
    revokePreviewUrl(previewImage);
    setPreviewImage(nextPreviewUrl);
    setAttachedFile(file);
    setAudioBlob(null);
    setAttachmentSource(source);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target) &&
        !emojiButtonRef.current?.contains(event.target)
      ) {
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
      applyVisualAttachment(file, "upload");
    } else if (file.type.startsWith("audio/")) {
      revokePreviewUrl(previewImage);
      setAttachedFile(file);
      setAudioBlob(file);
      setPreviewImage(null);
      setAttachmentSource("upload");
    } else {
      setComposerError("Select an image, video, or audio file.");
    }
    fileInputRef.current.value = null;
  };

  const handlePaste = (event) => {
    if (editingMessage) {
      return;
    }

    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type?.startsWith("image/"));
    if (!imageItem) {
      return;
    }

    const pastedFile = imageItem.getAsFile();
    if (!pastedFile) {
      return;
    }

    event.preventDefault();
    setComposerError("");

    if (pastedFile.size > MAX_UPLOAD_BYTES) {
      setComposerError("Pasted images must be smaller than 25 MB.");
      return;
    }

    const normalizedFile = new File(
      [pastedFile],
      pastedFile.name || `clipboard-image-${Date.now()}.png`,
      { type: pastedFile.type || "image/png" }
    );

    applyVisualAttachment(normalizedFile, "paste");
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
        revokePreviewUrl(previewImage);
        setAudioBlob(blob);
        setAttachedFile(blob);
        setPreviewImage(null); // clear image if recording
        setAttachmentSource("recording");
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
  const handleSend = async () => {
    setComposerError("");
    if (editingMessage) {
      const didSave = await onSaveEdit?.(message.trim());
      if (!didSave) {
        setComposerError("We couldn't save your edit. Please try again.");
      }
      return;
    }

    if (!message.trim() && !attachedFile && !audioBlob) {
      setComposerError("Write a message or attach a file first.");
      return;
    }

    await onSendMessage(message, attachedFile, previewImage);
    if (isTypingRef.current) {
      onStopTypingRef.current?.();
      isTypingRef.current = false;
    }
    setMessage("");
    localStorage.removeItem(draftStorageKey);
    setPreviewImage(null);
    setAttachedFile(null);
    setAudioBlob(null);
    setAttachmentSource(null);
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
    <div className="relative m-2 overflow-visible rounded-[32px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,251,255,0.92))] p-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur sm:m-3">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-10 top-0 h-16 rounded-full bg-[radial-gradient(circle,rgba(255,214,153,0.34),transparent_72%)] blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-6 bottom-3 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(104,163,255,0.16),transparent_70%)] blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 top-4 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.14),transparent_70%)] blur-2xl"
      />
      {showPicker && (
        <div
          ref={emojiPickerRef}
          className="absolute bottom-[calc(100%+0.9rem)] right-14 z-50 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
        >
          <EmojiPickerWrapper onEmojiSelect={handleEmojiSelect} />
        </div>
      )}

      <div className="relative flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {editingMessage && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-[20px] bg-[#fff5db] px-3 py-2.5 text-sm text-amber-900">
              <div className="min-w-0">
                <p className="font-semibold">Editing message</p>
                <p className="truncate text-xs text-amber-700">Press Enter to save changes.</p>
              </div>
              <button
                type="button"
                onClick={onCancelEdit}
                className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-amber-900 transition hover:bg-white"
              >
                Cancel
              </button>
            </div>
          )}

          {replyingMessage && !editingMessage && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-[20px] bg-[#eaf4ff] px-3 py-2.5 text-sm text-sky-900">
              <div className="min-w-0">
                <p className="font-medium">
                  Replying to {replyingMessage.sender?.username || "message"}
                </p>
                <p className="truncate text-xs text-sky-700">
                  {(replyingMessage.text || "Attachment").slice(0, 90)}
                </p>
              </div>
              <button
                type="button"
                onClick={onCancelReply}
                className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-sky-900 transition hover:bg-white"
              >
                Cancel
              </button>
            </div>
          )}

          {(previewImage || audioBlob) && (
            <div className="mb-2">
              {previewImage && (
                <div className="flex items-center gap-3 rounded-[22px] border border-white/80 bg-white/95 px-3 py-2.5 shadow-[0_12px_24px_rgba(148,163,184,0.12)]">
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="h-14 w-14 rounded-[16px] object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-700">
                        {attachmentSource === "paste" ? "Pasted image" : "Image attached"}
                      </p>
                      {attachmentSource === "paste" && (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                          Clipboard
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {attachedFile?.name || "Ready to send"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearCurrentAttachment}
                    className="text-sm font-medium text-rose-500"
                  >
                    Remove
                  </button>
                </div>
              )}

              {audioBlob && (
                <div className="flex items-center gap-3 rounded-[20px] bg-white px-3 py-2.5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-slate-900 text-xs font-medium text-white">
                    Mic
                  </div>
                  <audio controls src={URL.createObjectURL(audioBlob)} className="h-9 max-w-[180px] flex-1" />
                  <button
                    type="button"
                    onClick={clearCurrentAttachment}
                    className="text-sm font-medium text-rose-500"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 rounded-[28px] border border-white/90 bg-white/95 px-5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_rgba(148,163,184,0.14)] backdrop-blur">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Message
              </p>
              <input
                type="text"
                ref={inputRef}
                value={message}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={editingMessage ? "Refine your message..." : "Write something thoughtful..."}
                className="w-full min-w-0 bg-transparent text-[15px] font-medium text-slate-700 outline-none placeholder:font-normal placeholder:text-slate-400"
              />
            </div>

            <div className="h-9 w-px bg-gradient-to-b from-transparent via-slate-200 to-transparent" />

            <div className="flex items-center gap-1 rounded-full bg-slate-50/80 px-1.5 py-1">
              <button
                type="button"
                ref={emojiButtonRef}
                className={`rounded-full p-2.5 transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  showPicker
                    ? "bg-white text-slate-700 shadow-sm"
                    : "text-slate-500 hover:bg-white hover:text-slate-700 hover:shadow-sm"
                }`}
                onClick={() => setShowPicker((prev) => !prev)}
                disabled={Boolean(editingMessage)}
                aria-label="Open emoji picker"
              >
                <AddReactionOutlinedIcon fontSize="small" />
              </button>

              <button
                type="button"
                className="rounded-full p-2.5 text-slate-500 transition hover:bg-white hover:text-slate-700 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => fileInputRef.current.click()}
                disabled={Boolean(editingMessage)}
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

              <button
                type="button"
                className={`rounded-full p-2.5 transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  isRecording
                    ? "bg-rose-100 text-rose-500 shadow-sm"
                    : "text-slate-500 hover:bg-white hover:text-slate-700 hover:shadow-sm"
                }`}
                onClick={isRecording ? handleStopRecording : handleStartRecording}
                disabled={Boolean(editingMessage)}
                aria-label={isRecording ? "Stop recording" : "Start recording"}
              >
                <SettingsVoiceIcon fontSize="small" />
              </button>
            </div>
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

        <button
          type="button"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#172033,#0f172a)] text-white shadow-[0_14px_28px_rgba(15,23,42,0.22)] transition hover:-translate-y-0.5 hover:brightness-105"
          onClick={handleSend}
          aria-label={editingMessage ? "Save edited message" : "Send message"}
        >
          {editingMessage ? (
            <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em]">
              Save
            </span>
          ) : (
            <SendIcon fontSize="small" />
          )}
        </button>
      </div>
    </div>
  );
};

export default MessageInput;
