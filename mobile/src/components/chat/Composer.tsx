import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Keyboard, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ConversationStyles } from "../../screens/ConversationsScreen";
import type { ThemeColors } from "../../theme/colors";
import type { ChatMessage } from "../../types";
import { toReplyPreviewText } from "./format";

export type ComposerHandle = {
  /** Focuses the input with the cursor at the end (used after swipe/double-tap to reply). */
  activate: () => void;
  isFocused: () => boolean;
};

type ComposerProps = {
  styles: ConversationStyles;
  colors: ThemeColors;
  currentUserId?: number;
  replyTarget: ChatMessage | null;
  sending: boolean;
  // Callbacks should be stable so typing doesn't re-render the screen or this component.
  onClearReply: () => void;
  onFocus: () => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  /** Sends the text; resolves true when it was sent (the draft is then cleared). */
  onSend: (text: string) => Promise<boolean>;
};

/**
 * Chat message input. Holds the draft locally so keystrokes re-render only this component,
 * not the message list.
 */
export const Composer = React.memo(
  forwardRef<ComposerHandle, ComposerProps>(function Composer(
    {
      styles,
      colors,
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
    const messageInputRef = useRef<TextInput | null>(null);

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

    const handleSend = useCallback(async () => {
      const sent = await onSend(messageTextRef.current);
      if (sent) setMessageText("");
    }, [onSend]);

    return (
      <View style={styles.inputWrap}>
        {replyTarget ? (
          <View style={styles.replyComposerBar}>
            <View style={styles.replyComposerTextWrap}>
              <Text style={styles.replyComposerLabel}>
                Replying to {replyTarget.sender?.id === currentUserId ? "your message" : replyTarget.sender?.username || "user"}
              </Text>
              <Text style={styles.replyComposerText} numberOfLines={1}>
                {toReplyPreviewText(replyTarget)}
              </Text>
            </View>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onClearReply();
              }}
              style={styles.replyComposerClose}
            >
              <Ionicons name="close" size={16} color={colors.mutedText} />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.inputRow}>
          <TextInput
            ref={messageInputRef}
            style={styles.input}
            value={messageText}
            onChangeText={handleMessageInputChange}
            onPressIn={(event) => {
              event.stopPropagation();
              activateMessageInput();
            }}
            onFocus={handleInputFocus}
            placeholder={
              replyTarget
                ? `Reply to: ${toReplyPreviewText(replyTarget)}`
                : "Type a message..."
            }
            placeholderTextColor={colors.mutedText}
          />
          <Pressable
            style={styles.sendButton}
            onPress={(event) => {
              event.stopPropagation();
              handleSend();
            }}
            disabled={sending}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  })
);
