import type { TextInputInstance } from "react-native";
import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Image, Keyboard, Pressable, Text, TextInput, View } from "react-native";
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

export type ComposerHandle = {
  /** Focuses the input with the cursor at the end (used after swipe/double-tap to reply). */
  activate: () => void;
  isFocused: () => boolean;
};

type ComposerProps = {
  styles: ChatStyles;
  warm: WarmColors;
  currentUserId?: number;
  replyTarget: ChatMessage | null;
  sending: boolean;
  // Callbacks should be stable so typing doesn't re-render the screen or this component.
  onClearReply: () => void;
  onFocus: () => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  /**
   * Sends the text (and optional picked photo); resolves true when it was sent. Text-only drafts
   * are cleared on success; a draft with a photo is cleared right away (the screen shows an
   * optimistic bubble) and restored if the send fails.
   */
  onSend: (text: string, attachment: PickedAttachment | null) => Promise<boolean>;
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
      sending,
      onClearReply,
      onFocus,
      onTypingStart,
      onTypingStop,
      onSend,
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
    // Guards against a double tap sending twice before `sending` re-renders.
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

    const handleInputFocus = useCallback(() => {
      onFocus();
      const input = messageInputRef.current;
      if (!input) return;
      const cursorPosition = messageTextRef.current.length;
      input.setNativeProps({
        selection: { start: cursorPosition, end: cursorPosition },
      });
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
      sendInFlightRef.current = true;
      try {
        if (!pickedAttachment) {
          const sent = await onSend(text, null);
          if (sent) setMessageText("");
          return;
        }
        // Clear right away: the optimistic bubble shows the photo while it uploads.
        messageTextRef.current = "";
        attachmentRef.current = null;
        setMessageText("");
        setAttachment(null);
        onTypingStop();
        const sent = await onSend(text, pickedAttachment);
        if (!sent && !messageTextRef.current && !attachmentRef.current) {
          // Restore the draft unless the user already started a new one.
          setMessageText(text);
          setAttachment(pickedAttachment);
        }
      } finally {
        sendInFlightRef.current = false;
      }
    }, [onSend, onTypingStop]);

    const hasContent = Boolean(attachment) || messageText.trim().length > 0;

    return (
      <View style={styles.composerWrap}>
        {replyTarget ? (
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
        <View style={styles.composerRow}>
          <View style={styles.composerPill}>
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
            <TextInput
              ref={messageInputRef}
              style={styles.composerInput}
              value={messageText}
              onChangeText={handleMessageInputChange}
              onPressIn={(event) => {
                event.stopPropagation();
                activateMessageInput();
              }}
              onFocus={handleInputFocus}
              multiline
              placeholder={attachment ? "Add a caption…" : replyTarget ? "Write a reply…" : "Message"}
              placeholderTextColor={warm.mutedInk}
              accessibilityLabel="Message"
            />
          </View>
          <SendButton
            warm={warm}
            visible={hasContent}
            disabled={sending}
            busy={sending}
            accessibilityLabel={attachment ? "Send photo" : "Send message"}
            onPress={handleSend}
          />
        </View>
      </View>
    );
  })
);
