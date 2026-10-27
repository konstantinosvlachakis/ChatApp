import React, { Suspense, useState, useRef, useEffect, useMemo } from "react";
import SentimentSatisfiedAltRoundedIcon from "@mui/icons-material/SentimentSatisfiedAltRounded";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import MicNoneRoundedIcon from "@mui/icons-material/MicNoneRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import { logger } from "../../../lib/logger";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// emoji-picker-element is sizeable; only fetch it the first time the picker is opened.
const EmojiPickerWrapper = React.lazy(() =>
  import("./EmojiPickerWrapper").then((module) => ({ default: module.EmojiPickerWrapper }))
);

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
  disabled = false,
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
  const [isSending, setIsSending] = useState(false);

  const emojiPickerRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const isTypingRef = useRef(false);
  const hasInitializedTypingRef = useRef(false);
  const previousConnectionStatusRef = useRef(connectionStatus);
  const onTypingRef = useRef(onTyping);
  const onStopTypingRef = useRef(onStopTyping);
  const draftBeforeEditRef = useRef("");
  const previousEditingMessageIdRef = useRef(null);
  // Synchronous in-flight guard: a second Enter during an upload must not post twice.
  const isSendingRef = useRef(false);
  const isMountedRef = useRef(true);
  // Bumped whenever a new attachment is picked, so a failed send only restores its own
  // attachment if nothing new was attached meanwhile.
  const attachmentVersionRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
    attachmentVersionRef.current += 1;
    const nextPreviewUrl = URL.createObjectURL(file);
    revokePreviewUrl(previewImage);
    setPreviewImage(nextPreviewUrl);
    setAttachedFile(file);
    setAudioBlob(null);
    setAttachmentSource(source);
  };

  // One object URL per recorded/attached audio blob, revoked when it changes or unmounts
  // (creating it inline in render leaked a new blob URL on every re-render).
  const audioPreviewUrl = useMemo(
    () => (audioBlob ? URL.createObjectURL(audioBlob) : null),
    [audioBlob]
  );

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [audioPreviewUrl]);

  const stopRecordingStream = () => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  };

  // Release the microphone if the composer unmounts mid-recording.
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      stopRecordingStream();
    };
  }, []);

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
      attachmentVersionRef.current += 1;
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
      stopRecordingStream();
      recordingStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        // Stop the tracks so the browser's microphone indicator turns off.
        stream.getTracks().forEach((track) => track.stop());
        if (recordingStreamRef.current === stream) recordingStreamRef.current = null;
        const blob = new Blob(chunks, { type: "audio/webm" });
        attachmentVersionRef.current += 1;
        revokePreviewUrl(previewImage);
        setAudioBlob(blob);
        setAttachedFile(blob);
        setPreviewImage(null); // clear image if recording
        setAttachmentSource("recording");
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      stopRecordingStream();
      logger.error("Microphone access error:", err);
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
    if (isSendingRef.current || disabled) return;
    setComposerError("");
    if (editingMessage) {
      isSendingRef.current = true;
      setIsSending(true);
      try {
        const didSave = await onSaveEdit?.(message.trim());
        if (!didSave && isMountedRef.current) {
          setComposerError("We couldn't save your edit. Please try again.");
        }
      } finally {
        isSendingRef.current = false;
        if (isMountedRef.current) setIsSending(false);
      }
      return;
    }

    if (!message.trim() && !attachedFile && !audioBlob) {
      setComposerError("Write a message or attach a file first.");
      return;
    }

    // Clear right away (the optimistic bubble shows the message) and keep a snapshot to
    // restore if the send fails. Text typed during the upload is kept either way.
    const snapshot = { message, attachedFile, previewImage, audioBlob, attachmentSource };
    const attachmentVersion = attachmentVersionRef.current;
    isSendingRef.current = true;
    setIsSending(true);
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

    let didSend = false;
    try {
      didSend = (await onSendMessage(snapshot.message, snapshot.attachedFile, snapshot.previewImage)) !== false;
    } catch (err) {
      logger.warn("Send failed:", err);
    } finally {
      isSendingRef.current = false;
      if (isMountedRef.current) setIsSending(false);
    }

    // On success the chat owns the preview URL (optimistic bubble); nothing to restore.
    if (didSend) return;

    if (!isMountedRef.current) {
      // The chat was left mid-send: keep the text as that conversation's draft.
      if (snapshot.message.trim() && !localStorage.getItem(draftStorageKey)) {
        localStorage.setItem(draftStorageKey, snapshot.message);
      }
      revokePreviewUrl(snapshot.previewImage);
      return;
    }

    setMessage((currentText) => (currentText.trim() ? currentText : snapshot.message));
    if (snapshot.attachedFile && attachmentVersionRef.current === attachmentVersion) {
      setPreviewImage(snapshot.previewImage);
      setAttachedFile(snapshot.attachedFile);
      setAudioBlob(snapshot.audioBlob);
      setAttachmentSource(snapshot.attachmentSource);
    } else {
      revokePreviewUrl(snapshot.previewImage);
    }
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
    <div className="cv-composer-inner">
      {showPicker && (
        <div ref={emojiPickerRef} className="cv-emoji-popover">
          <Suspense fallback={<p className="cv-messages-status">Loading emoji…</p>}>
            <EmojiPickerWrapper onEmojiSelect={handleEmojiSelect} />
          </Suspense>
        </div>
      )}

      {editingMessage && (
        <div className="cv-composer-banner is-edit">
          <p>
            <strong>Editing message</strong>
            <span>Press Enter to save changes.</span>
          </p>
          <button type="button" onClick={onCancelEdit}>
            Cancel
          </button>
        </div>
      )}

      {replyingMessage && !editingMessage && (
        <div className="cv-composer-banner is-reply">
          <p>
            <strong>Replying to {replyingMessage.sender?.username || "message"}</strong>
            <span>{(replyingMessage.text || "Attachment").slice(0, 90)}</span>
          </p>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply">
            Cancel
          </button>
        </div>
      )}

      {previewImage && (
        <div className="cv-attachment-preview">
          <img src={previewImage} alt="Attachment preview" />
          <p className="cv-attachment-preview-text">
            {attachmentSource === "paste" ? "Pasted image" : "Image attached"}
            <span>{attachedFile?.name || "Ready to send"}</span>
          </p>
          <button type="button" onClick={clearCurrentAttachment} className="cv-attachment-remove">
            Remove
          </button>
        </div>
      )}

      {audioBlob && (
        <div className="cv-attachment-preview">
          <p className="cv-attachment-preview-text" style={{ flex: "none" }}>Voice note</p>
          <audio controls src={audioPreviewUrl} aria-label="Recorded voice note" />
          <button type="button" onClick={clearCurrentAttachment} className="cv-attachment-remove">
            Remove
          </button>
        </div>
      )}

      <div className="cv-composer-row">
        <button
          type="button"
          className="cv-icon-button"
          onClick={() => fileInputRef.current.click()}
          disabled={Boolean(editingMessage)}
          aria-label="Attach file"
          title="Attach file"
        >
          <AttachFileRoundedIcon />
        </button>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileAttach}
          tabIndex={-1}
          aria-hidden="true"
        />

        <div className="cv-composer">
          <input
            type="text"
            ref={inputRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={editingMessage ? "Edit your message…" : "Write a message…"}
            aria-label={editingMessage ? "Edit message" : "Message"}
          />
          <button
            type="button"
            ref={emojiButtonRef}
            className={`cv-icon-button ${showPicker ? "is-on" : ""}`}
            onClick={() => setShowPicker((prev) => !prev)}
            disabled={Boolean(editingMessage)}
            aria-label={showPicker ? "Close emoji picker" : "Open emoji picker"}
            aria-expanded={showPicker}
            title="Emoji"
          >
            <SentimentSatisfiedAltRoundedIcon />
          </button>
          <button
            type="button"
            className={`cv-icon-button ${isRecording ? "is-on" : ""}`}
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            disabled={Boolean(editingMessage)}
            aria-label={isRecording ? "Stop recording" : "Record a voice note"}
            aria-pressed={isRecording}
            title={isRecording ? "Stop recording" : "Voice note"}
          >
            {isRecording ? <StopRoundedIcon /> : <MicNoneRoundedIcon />}
          </button>
        </div>

        <button
          type="button"
          className={`cv-send ${editingMessage ? "is-save" : ""}`}
          onClick={handleSend}
          disabled={isSending || disabled}
          aria-busy={isSending || undefined}
          aria-label={editingMessage ? "Save edited message" : "Send message"}
        >
          {editingMessage ? "Save" : <SendRoundedIcon />}
        </button>
      </div>

      {(composerError || connectionStatus !== "connected" || isRecording) && (
        <div className="cv-composer-notes" role="status">
          {isRecording && <span className="is-warning">Recording… tap stop when you're done.</span>}
          {composerError && <span className="is-error">{composerError}</span>}
          {connectionStatus !== "connected" && (
            <span className="is-warning">
              {connectionStatus === "reconnecting"
                ? "Chat is reconnecting. Draft is saved."
                : "Chat is offline. Draft is saved."}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageInput;
