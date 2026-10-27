import React, { useCallback, useMemo, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import type { ConversationStyles } from "../../screens/ConversationsScreen";
import type { ThemeColors } from "../../theme/colors";
import type { ChatMessage } from "../../types";
import {
  ALLOWED_REACTIONS,
  escapeRegExp,
  formatMessageTime,
  statusTicks,
  toReplyPreviewText,
} from "./format";

export type MessageRowProps = {
  item: ChatMessage;
  currentUserId?: number;
  isMine: boolean;
  /** Day separator label above this row, or null when the previous message is on the same day. */
  dayLabel: string | null;
  showUnreadDivider: boolean;
  isReplyActive: boolean;
  showReactionPicker: boolean;
  isHighlighted: boolean;
  /** Trimmed search query when this message is a search result, else null. */
  searchHighlight: string | null;
  isActiveSearchMatch: boolean;
  styles: ConversationStyles;
  colors: ThemeColors;
  highlightOpacity: Animated.Value;
  highlightScale: Animated.Value;
  // Handlers must be stable (the row is memoized).
  onSwipeReply: (message: ChatMessage) => void;
  onReactionSelect: (message: ChatMessage, emoji: string) => void;
  onOpenMenu: (message: ChatMessage, isMine: boolean, pageY: number) => void;
  onTap: (message: ChatMessage) => void;
};

function MessageRowComponent({
  item,
  currentUserId,
  isMine,
  dayLabel,
  showUnreadDivider,
  isReplyActive,
  showReactionPicker,
  isHighlighted,
  searchHighlight,
  isActiveSearchMatch,
  styles,
  colors,
  highlightOpacity,
  highlightScale,
  onSwipeReply,
  onReactionSelect,
  onOpenMenu,
  onTap,
}: MessageRowProps) {
  const swipeableRef = useRef<Swipeable | null>(null);

  const reactionEntries = useMemo(() => {
    const groupedReactions = (item.reactions || []).reduce<Record<string, number>>((acc, reaction) => {
      acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(groupedReactions);
  }, [item.reactions]);

  const replyAuthor =
    item.reply_to?.sender?.id === currentUserId ? "You" : item.reply_to?.sender?.username || "User";
  const highlightAnimatedStyle = isHighlighted
    ? {
        opacity: highlightOpacity,
        transform: [{ scale: highlightScale }],
      }
    : null;

  const handleSwipeOpen = useCallback(
    (direction: "left" | "right") => {
      if ((isMine && direction !== "right") || (!isMine && direction !== "left")) return;
      swipeableRef.current?.close();
      onSwipeReply(item);
    },
    [isMine, item, onSwipeReply]
  );

  const renderReplySwipeAction = useCallback(
    () => (
      <View style={[styles.replySwipeAction, isMine ? styles.replySwipeActionMine : styles.replySwipeActionOther]}>
        <Ionicons name={isMine ? "arrow-undo" : "arrow-redo"} size={18} color={colors.primary} />
      </View>
    ),
    [colors.primary, isMine, styles]
  );

  const messageText = useMemo(() => {
    const value = String(item.text || "");
    if (!searchHighlight) return value;

    const pattern = new RegExp(`(${escapeRegExp(searchHighlight)})`, "ig");
    return value.split(pattern).map((part, index) => {
      const isMatch = part.toLowerCase() === searchHighlight.toLowerCase();
      if (!isMatch) return part;
      return (
        <Text
          key={`${item.id}-${index}`}
          style={[styles.inlineHighlight, isActiveSearchMatch ? styles.inlineHighlightActive : null]}
        >
          {part}
        </Text>
      );
    });
  }, [isActiveSearchMatch, item.id, item.text, searchHighlight, styles]);

  return (
    <>
      {dayLabel != null ? (
        <View style={styles.daySeparatorRow}>
          <Text style={styles.daySeparatorText}>{dayLabel}</Text>
        </View>
      ) : null}
      {showUnreadDivider ? (
        <View style={styles.unreadDividerRow}>
          <Text style={styles.unreadDividerText}>Unread messages</Text>
        </View>
      ) : null}
      <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}>
      <Swipeable
        ref={swipeableRef}
        friction={1.05}
        overshootLeft={false}
        overshootRight={false}
        leftThreshold={8}
        rightThreshold={8}
        dragOffsetFromLeftEdge={8}
        dragOffsetFromRightEdge={8}
        containerStyle={styles.swipeContainer}
        childrenContainerStyle={styles.swipeChildren}
        renderLeftActions={!isMine ? renderReplySwipeAction : undefined}
        renderRightActions={isMine ? renderReplySwipeAction : undefined}
        onSwipeableWillOpen={handleSwipeOpen}
      >
      <View style={styles.messageContainer}>
        {showReactionPicker ? (
          <View style={styles.reactionPicker}>
            {ALLOWED_REACTIONS.map((emoji) => (
              <Pressable
                key={`${item.id}-${emoji}`}
                style={[
                  styles.reactionPickerItem,
                  item.current_user_reaction === emoji && styles.reactionPickerItemActive,
                ]}
                onPress={() => onReactionSelect(item, emoji)}
              >
                <Text style={styles.reactionPickerEmoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Pressable
          style={[
            styles.messageBubble,
            isMine ? styles.messageMine : styles.messageOther,
            isReplyActive
              ? isMine
                ? styles.messageBubbleReplyActiveMine
                : styles.messageBubbleReplyActiveOther
              : null,
            isHighlighted ? styles.messageBubbleHighlighted : null,
          ]}
          onLongPress={(event) => {
            event.stopPropagation();
            onOpenMenu(item, isMine, event.nativeEvent.pageY);
          }}
          onPress={(event) => {
            event.stopPropagation();
            onTap(item);
          }}
          delayLongPress={520}
        >
          {isReplyActive ? (
            <View style={[styles.replyActiveIndicator, isMine ? styles.replyActiveIndicatorMine : styles.replyActiveIndicatorOther]}>
              <Ionicons name={isMine ? "arrow-undo" : "arrow-redo"} size={14} color={colors.primary} />
            </View>
          ) : null}
          {isHighlighted && highlightAnimatedStyle ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.messageBubbleHighlightOverlay, highlightAnimatedStyle]}
            />
          ) : null}
          {item.reply_to ? (
            <View style={[styles.replySnippet, isMine ? styles.replySnippetMine : styles.replySnippetOther]}>
              <Text
                numberOfLines={1}
                style={[styles.replySnippetAuthor, isMine ? styles.replySnippetAuthorMine : styles.replySnippetAuthorOther]}
              >
                {replyAuthor}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.replySnippetText, isMine ? styles.replySnippetTextMine : styles.replySnippetTextOther]}
              >
                {toReplyPreviewText(item.reply_to)}
              </Text>
            </View>
          ) : null}
          <Text
            style={[styles.messageText, isMine ? styles.messageTextMine : styles.messageTextOther]}
          >
            {messageText}
          </Text>
          {item.is_pinned ? (
            <View style={styles.messageFlagRow}>
              <Ionicons name="pin" size={11} color={isMine ? "#dbeafe" : colors.mutedText} />
              <Text style={[styles.messageFlagText, isMine ? styles.messageFlagTextMine : styles.messageFlagTextOther]}>
                Pinned
              </Text>
            </View>
          ) : null}
          {item.edited_at ? (
            <Text style={[styles.messageEditedText, isMine ? styles.messageEditedTextMine : styles.messageEditedTextOther]}>
              Edited
            </Text>
          ) : null}
          <View style={styles.messageMetaRow}>
            <Text style={[styles.messageTime, isMine ? styles.messageTimeMine : styles.messageTimeOther]}>
              {formatMessageTime(item.timestamp)}
            </Text>
            {isMine ? (
              <Text style={[styles.statusTick, item.status === "read" ? styles.statusTickRead : styles.statusTickDefault]}>
                {statusTicks(item.status)}
              </Text>
            ) : null}
          </View>
        </Pressable>

        {reactionEntries.length > 0 ? (
          <View style={[styles.reactionsRow, isMine ? styles.reactionsRowMine : styles.reactionsRowOther]}>
            {reactionEntries.map(([emoji, count]) => (
              <View
                key={`${item.id}-${emoji}`}
                style={[
                  styles.reactionChip,
                  item.current_user_reaction === emoji && styles.reactionChipMine,
                ]}
              >
                <Text style={styles.reactionChipText}>
                  {emoji} {count}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      </Swipeable>
    </View>
    </>
  );
}

/** One chat message row; re-renders only when its message object or flags change. */
export const MessageRow = React.memo(MessageRowComponent);
