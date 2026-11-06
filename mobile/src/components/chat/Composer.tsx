import type { TextInputInstance } from "react-native";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Keyboard, Pressable, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { showToast } from "../../services/toast";
import type { WarmColors } from "../../theme/warm";
import type { ChatMessage } from "../../types";
import {
  formatFileSize,
  isAttachmentTooLarge,
  MAX_ATTACHMENT_BYTES,
  resolveImageMimeType,
  uploadFileName,
  type PickedAttachment,
} from "./attachments";
import type { ChatStyles } from "./chatStyles";
import { toReplyPreviewText } from "./format";
import { SendButton } from "./SendButton";
import { RecordingBar, useVoiceNoteRecorder } from "./VoiceRecorder";
import { MAX_VOICE_NOTE_MS } from "./voiceNote";

export type ComposerHandle = {
  /** Focuses the input with the cursor at the end (used after swipe/double-tap to reply). */
  activate: () => void;
  isFocused: () => boolean;
  /** Replaces the text with `text` and focuses the input (e.g. an empty-chat opening line). */
  setDraft: (text: string) => void;
};

type ComposerProps = {
  styles: ChatStyles;
  warm: WarmColors;
  currentUserId?: number;
  replyTarget: ChatMessage | null;
  /** Own message being edited: the draft holds its text and Send saves the edit. */
  editingMessage?: ChatMessage | null;
  /** Leaves edit mode (the composer clears its draft first). */
  onCancelEdit?: () => void;
  sending: boolean;
  // Callbacks should be stable so typing doesn't re-render the screen or this component.
  onClearReply: () => void;
  onFocus: () => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  /**
   * Sends the text (and optional picked photo or recorded voice note); resolves true when it was
   * sent. The draft is cleared right away (the screen shows an optimistic bubble) and restored if
   * the send fails; a failed voice note is not restored (the screen shows an error).
   */
  onSend: (text: string, attachment: PickedAttachment | null) => Promise<boolean>;
  /** Optional: shows the sticker/GIF button. Should be stable. */
  onOpenMediaPicker?: () => void;
};

/**
 * Chat message input. Holds the draft locally so keystrokes re-render only this component,
 * not the message list.
 */
export const Composer = React.memo(
  forwardRef<ComposerHandle, ComposerProps>(function Composer(
    {
      styles,
      warm,
      currentUserId,
      replyTarget,
      editingMessage = null,
      onCancelEdit,
      sending,
      onClearReply,
      onFocus,
      onTypingStart,
      onTypingStop,
      onSend,
      onOpenMediaPicker,
    },
    ref
  ) {
    const [messageText, setMessageText] = useState("");
    const messageTextRef = useRef("");
    messageTextRef.current = messageText;
    const messageInputRef = useRef<TextInputInstance | null>(null);
    const [attachment, setAttachment] = useState<PickedAttachment | null>(null);
    const attachmentRef = useRef<PickedAttachment | null>(null);
    attachmentRef.current = attachment;
    // Guards against a double tap sending the same draft twice.
    const sendInFlightRef = useRef(false);
    const pickingRef = useRef(false);

    const activateMessageInput = useCallback(() => {
      const focusInput = () => {
        const input = messageInputRef.current;
        if (!input) return;
        input.focus();
        const cursorPosition = messageTextRef.current.length;
        input.setNativeProps({
          selection: { start: cursorPosition, end: cursorPosition },
        });
      };
      // Already typing: just move the cursor to the end (dismissing would close the keyboard).
      if (messageInputRef.current?.isFocused()) {
        focusInput();
        return;
      }
      Keyboard.dismiss();
      requestAnimationFrame(focusInput);
      setTimeout(focusInput, 50);
      setTimeout(focusInput, 150);
      // Reply from the message sheet: retry once its slide-out has finished.
      setTimeout(focusInput, 380);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        activate: activateMessageInput,
        isFocused: () => Boolean(messageInputRef.current?.isFocused()),
        setDraft: (text: string) => {
          messageTextRef.current = text;
          setMessageText(text);
          activateMessageInput();
        },
      }),
      [activateMessageInput]
    );

    const handleMessageInputChange = useCallback(
      (value: string) => {
        setMessageText(value);
        if (value.trim().length === 0) {
          onTypingStop();
          return;
        }
        onTypingStart();
      },
      [onTypingStart, onTypingStop]
    );

    // A tap focuses the input natively and puts the cursor where the user tapped; long-press
    // selects text as usual. Only reply / draft activation moves the cursor to the end.
    const handleInputFocus = useCallback(() => {
      onFocus();
    }, [onFocus]);

    const handlePickPhoto = useCallback(async () => {
      if (pickingRef.current) return;
      pickingRef.current = true;
      try {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          showToast("Allow photo access in Settings to send photos.", { title: "Permission needed" });
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          allowsMultipleSelection: false,
          quality: 0.8,
          exif: false,
        });
        if (result.canceled || !result.assets?.length) return;
        const asset = result.assets[0];
        if (!asset.uri) {
          showToast("Could not read the selected photo.", { variant: "error" });
          return;
        }
        const mimeType = resolveImageMimeType(asset.mimeType, asset.fileName || asset.uri);
        if (!mimeType) {
          showToast("Only JPEG, PNG, GIF, WebP and HEIC photos can be sent.", {
            title: "Unsupported photo",
            variant: "error",
          });
          return;
        }
        if (isAttachmentTooLarge(asset.fileSize)) {
          showToast(
            `This photo is ${formatFileSize(asset.fileSize)}; the limit is ${formatFileSize(MAX_ATTACHMENT_BYTES)}.`,
            { title: "Photo too large", variant: "error" }
          );
          return;
        }
        setAttachment({
          uri: asset.uri,
          name: uploadFileName(mimeType),
          mimeType,
          fileSize: asset.fileSize ?? null,
        });
      } catch {
        showToast("Could not open your photos.", { variant: "error" });
      } finally {
        pickingRef.current = false;
      }
    }, []);

    const handleSend = useCallback(async () => {
      if (sendInFlightRef.current) return;
      const text = messageTextRef.current;
      const pickedAttachment = attachmentRef.current;
      if (!pickedAttachment && !text.trim()) return;
      // Clear right away: the optimistic bubble shows the message while it sends, and the next
      // message can be typed at once (the screen sends them in order).
      sendInFlightRef.current = true;
      messageTextRef.current = "";
      attachmentRef.current = null;
      setMessageText("");
      setAttachment(null);
      onTypingStop();
      // Only guards a double tap within the same frame; not held for the request.
      requestAnimationFrame(() => {
        sendInFlightRef.current = false;
      });
      const sent = await onSend(text, pickedAttachment);
      if (!sent && !messageTextRef.current && !attachmentRef.current) {
        // Restore the draft unless the user already started a new one.
        messageTextRef.current = text;
        attachmentRef.current = pickedAttachment;
        setMessageText(text);
        setAttachment(pickedAttachment);
      }
    }, [onSend, onTypingStop]);

    const hasContent = Boolean(attachment) || messageText.trim().length > 0;

    // Voice notes: the mic shows while the draft is empty; recording replaces the input row.
    const voice = useVoiceNoteRecorder();
    const startRecording = useCallback(() => {
      Keyboard.dismiss();
      onTypingStop();
      void voice.start();
    }, [onTypingStop, voice]);
    const sendRecording = useCallback(async () => {
      const file = await voice.stop(true);
      if (file) await onSend("", file);
    }, [onSend, voice]);
    const discardRecording = useCallback(() => {
      void voice.stop(false);
    }, [voice]);
    useEffect(() => {
      if (voice.recording && voice.durationMs >= MAX_VOICE_NOTE_MS) void sendRecording();
    }, [sendRecording, voice.durationMs, voice.recording]);

    return (
      <View style={styles.composerWrap}>
        {editingMessage ? (
          <View style={styles.composerChip}>
            <View style={styles.composerChipAccent} />
            <View style={styles.composerChipTextWrap}>
              <Text style={styles.composerChipLabel} numberOfLines={1}>
                Editing message
              </Text>
              <Text style={styles.composerChipText} numberOfLines={1}>
                {editingMessage.text || ""}
              </Text>
            </View>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                messageTextRef.current = "";
                setMessageText("");
                onTypingStop();
                onCancelEdit?.();
              }}
              style={styles.composerChipClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel editing"
            >
              <Ionicons name="close" size={18} color={warm.mutedInk} />
            </Pressable>
          </View>
        ) : replyTarget ? (
          <View style={styles.composerChip}>
            <View style={styles.composerChipAccent} />
            <View style={styles.composerChipTextWrap}>
              <Text style={styles.composerChipLabel} numberOfLines={1}>
                Replying to {replyTarget.sender?.id === currentUserId ? "your message" : replyTarget.sender?.username || "user"}
              </Text>
              <Text style={styles.composerChipText} numberOfLines={1}>
                {toReplyPreviewText(replyTarget)}
              </Text>
            </View>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onClearReply();
              }}
              style={styles.composerChipClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel reply"
            >
              <Ionicons name="close" size={18} color={warm.mutedInk} />
            </Pressable>
          </View>
        ) : null}
        {attachment ? (
          <View style={styles.composerChip}>
            <Image
              source={{ uri: attachment.uri }}
              style={styles.composerChipThumb}
              contentFit="cover"
              cachePolicy="memory"
              recyclingKey={attachment.uri}
              transition={150}
              accessibilityIgnoresInvertColors
            />
            <View style={styles.composerChipTextWrap}>
              <Text style={styles.composerChipLabel}>Photo</Text>
              <Text style={styles.composerChipText} numberOfLines={1}>
                {attachment.fileSize ? formatFileSize(attachment.fileSize) : "Add a caption (optional)"}
              </Text>
            </View>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                setAttachment(null);
              }}
              style={styles.composerChipClose}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
            >
              <Ionicons name="close" size={18} color={warm.mutedInk} />
            </Pressable>
          </View>
        ) : null}
        {voice.recording ? (
          <RecordingBar warm={warm} durationMs={voice.durationMs} onDiscard={discardRecording} onSend={sendRecording} />
        ) : (
        <View style={styles.composerRow}>
          <View style={styles.composerPill}>
            {!editingMessage ? (
            <Pressable
              style={styles.attachButton}
              onPress={(event) => {
                event.stopPropagation();
                handlePickPhoto();
              }}
              disabled={sending}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={attachment ? "Replace photo" : "Attach a photo"}
            >
              <Ionicons name="image-outline" size={22} color={warm.teal} />
            </Pressable>
            ) : null}
            <TextInput
              ref={messageInputRef}
              style={styles.composerInput}
              value={messageText}
              onChangeText={handleMessageInputChange}
              onPressIn={(event) => event.stopPropagation()}
              onFocus={handleInputFocus}
              multiline
              placeholder={
                editingMessage ? "Edit your message…" : attachment ? "Add a caption…" : replyTarget ? "Write a reply…" : "Message"
              }
              placeholderTextColor={warm.mutedInk}
              accessibilityLabel="Message"
            />
            {onOpenMediaPicker && !editingMessage ? (
              <Pressable
                style={styles.attachButton}
                onPress={(event) => {
                  event.stopPropagation();
                  Keyboard.dismiss();
                  onOpenMediaPicker();
                }}
                disabled={sending}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel="Stickers and GIFs"
              >
                <Ionicons name="happy-outline" size={22} color={warm.teal} />
              </Pressable>
            ) : null}
            {!hasContent && !editingMessage ? (
              <Pressable
                style={styles.attachButton}
                onPress={(event) => {
                  event.stopPropagation();
                  startRecording();
                }}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel="Record a voice message"
              >
                <Ionicons name="mic-outline" size={23} color={warm.teal} />
              </Pressable>
            ) : null}
          </View>
          <SendButton
            warm={warm}
            visible={hasContent}
            disabled={sending}
            busy={sending}
            icon={editingMessage ? "checkmark" : "arrow-up"}
            accessibilityLabel={editingMessage ? "Save edit" : attachment ? "Send photo" : "Send message"}
            onPress={handleSend}
          />
        </View>
        )}
      </View>
    );
  })
);
