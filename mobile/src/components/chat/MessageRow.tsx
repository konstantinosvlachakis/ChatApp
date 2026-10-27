import React, { useCallback, useMemo, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import type { WarmColors } from "../../theme/warm";
import type { ChatMessage } from "../../types";
import { getAttachmentKind } from "./attachments";
import { ChatAvatar } from "./ChatAvatar";
import { MESSAGE_AVATAR_SIZE, type ChatStyles } from "./chatStyles";
import { MessageAttachment } from "./MessageAttachment";
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
  /** Group position (see messageGroups.ts): spacing, joined corners, avatar/time/ticks on the last. */
  startsGroup: boolean;
  endsGroup: boolean;
  /** Other participant (received rows show their avatar once per group). */
  avatarName: string | null;
  avatarPath: string | null;
  isReplyActive: boolean;
  showReactionPicker: boolean;
  isHighlighted: boolean;
  /** Trimmed search query when this message is a search result, else null. */
  searchHighlight: string | null;
  isActiveSearchMatch: boolean;
  /** Quote text for `reply_to` (resolved by the screen so attachments get a label), else null. */
  replyPreview: string | null;
  /** Show the "Translate" chip under this received message. */
  showTranslate: boolean;
  styles: ChatStyles;
  warm: WarmColors;
  highlightOpacity: Animated.Value;
  highlightScale: Animated.Value;
  // Handlers must be stable (the row is memoized).
  onSwipeReply: (message: ChatMessage) => void;
  onReactionSelect: (message: ChatMessage, emoji: string) => void;
  onOpenMenu: (message: ChatMessage, isMine: boolean, pageY: number) => void;
  onTap: (message: ChatMessage) => void;
  /** Opens the full-screen viewer with the original image URL. */
  onOpenImage: (url: string) => void;
  onTranslate: (message: ChatMessage) => void;
};

function MessageRowComponent({
  item,
  currentUserId,
  isMine,
  dayLabel,
  showUnreadDivider,
  startsGroup,
  endsGroup,
  avatarName,
  avatarPath,
  isReplyActive,
  showReactionPicker,
  isHighlighted,
  searchHighlight,
  isActiveSearchMatch,
  replyPreview,
  showTranslate,
  styles,
  warm,
  highlightOpacity,
  highlightScale,
  onSwipeReply,
  onReactionSelect,
  onOpenMenu,
  onTap,
  onOpenImage,
  onTranslate,
}: MessageRowProps) {
  const swipeableRef = useRef<Swipeable | null>(null);
  const attachmentUrl = item.attachment_url || null;
  const attachmentKind = getAttachmentKind(attachmentUrl, item.local_mime_type);
  // Optimistic bubble of an attachment upload: not interactive until the server message replaces it.
  const isPending = item.local_status === "sending";
  const hasText = Boolean((item.text || "").trim());

  const handleAttachmentLongPress = useCallback(
    (pageY: number) => {
      if (isPending) return;
      onOpenMenu(item, isMine, pageY);
    },
    [isMine, isPending, item, onOpenMenu]
  );

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
      <View style={styles.replySwipeAction}>
        <Ionicons name={isMine ? "arrow-undo" : "arrow-redo"} size={18} color={warm.teal} />
      </View>
    ),
    [isMine, styles, warm.teal]
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

  const timeLabel = formatMessageTime(item.timestamp);
  const tickLabel = item.status === "read" ? "Seen" : item.status === "delivered" ? "Delivered" : "Sent";

  return (
    <>
      {dayLabel != null ? (
        <View style={styles.daySeparatorRow} accessibilityRole="header">
          <View style={styles.daySeparatorPill}>
            <Text style={styles.daySeparatorText}>{dayLabel}</Text>
          </View>
        </View>
      ) : null}
      {showUnreadDivider ? (
        <View style={styles.unreadDividerRow}>
          <View style={styles.unreadDividerLine} />
          <Text style={styles.unreadDividerText}>Unread messages</Text>
          <View style={styles.unreadDividerLine} />
        </View>
      ) : null}
      <View
        style={[
          styles.messageRow,
          startsGroup && styles.messageRowStartsGroup,
          isMine ? styles.messageRowMine : styles.messageRowOther,
        ]}
      >
        {!isMine ? (
          <View style={styles.avatarSlot}>
            {endsGroup ? (
              <ChatAvatar name={avatarName} imagePath={avatarPath} size={MESSAGE_AVATAR_SIZE} />
            ) : null}
          </View>
        ) : null}
        <View style={[styles.messageColumn, isMine ? styles.messageColumnMine : styles.messageColumnOther]}>
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
            enabled={!isPending}
          >
            <View style={styles.messageContainer}>
              {showReactionPicker ? (
                <View style={[styles.reactionPicker, isMine ? styles.reactionPickerRight : styles.reactionPickerLeft]}>
                  {ALLOWED_REACTIONS.map((emoji) => (
                    <Pressable
                      key={`${item.id}-${emoji}`}
                      style={[
                        styles.reactionPickerItem,
                        item.current_user_reaction === emoji && styles.reactionPickerItemActive,
                      ]}
                      onPress={() => onReactionSelect(item, emoji)}
                      accessibilityRole="button"
                      accessibilityLabel={`React with ${emoji}`}
                      accessibilityState={{ selected: item.current_user_reaction === emoji }}
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
                  !startsGroup && (isMine ? styles.messageMineJoinedTop : styles.messageOtherJoinedTop),
                  isPending ? styles.messageBubblePending : null,
                  isReplyActive
                    ? isMine
                      ? styles.messageBubbleReplyActiveMine
                      : styles.messageBubbleReplyActiveOther
                    : null,
                  isActiveSearchMatch ? styles.messageBubbleActiveSearch : null,
                ]}
                onLongPress={(event) => {
                  event.stopPropagation();
                  if (isPending) return;
                  onOpenMenu(item, isMine, event.nativeEvent.pageY);
                }}
                onPress={(event) => {
                  event.stopPropagation();
                  if (isPending) return;
                  onTap(item);
                }}
                delayLongPress={520}
                accessibilityHint={isPending ? undefined : "Long press for message options"}
              >
                {isReplyActive ? (
                  <View
                    style={[
                      styles.replyActiveIndicator,
                      isMine ? styles.replyActiveIndicatorMine : styles.replyActiveIndicatorOther,
                    ]}
                  >
                    <Ionicons name={isMine ? "arrow-undo" : "arrow-redo"} size={14} color={warm.teal} />
                  </View>
                ) : null}
                {isHighlighted && highlightAnimatedStyle ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.messageBubbleHighlightOverlay, highlightAnimatedStyle]}
                  />
                ) : null}
                {item.reply_to ? (
                  <View style={styles.replySnippet}>
                    <Text numberOfLines={1} style={styles.replySnippetAuthor}>
                      {replyAuthor}
                    </Text>
                    <Text numberOfLines={2} style={styles.replySnippetText}>
                      {replyPreview ?? toReplyPreviewText(item.reply_to)}
                    </Text>
                  </View>
                ) : null}
                {attachmentUrl && attachmentKind ? (
                  <MessageAttachment
                    messageId={item.id}
                    url={attachmentUrl}
                    kind={attachmentKind}
                    isPending={isPending}
                    styles={styles}
                    warm={warm}
                    onOpenImage={onOpenImage}
                    onLongPress={handleAttachmentLongPress}
                  />
                ) : null}
                {hasText || !attachmentUrl ? (
                  <Text style={[styles.messageText, attachmentUrl ? styles.attachmentCaption : null]}>
                    {messageText}
                  </Text>
                ) : null}
                {item.is_pinned || item.edited_at ? (
                  <View style={styles.messageFlagRow}>
                    {item.is_pinned ? (
                      <>
                        <Ionicons name="pin" size={12} color={warm.inkSoft} />
                        <Text style={styles.messageFlagText}>Pinned</Text>
                      </>
                    ) : null}
                    {item.edited_at ? (
                      <Text style={styles.messageFlagText}>{item.is_pinned ? " · Edited" : "Edited"}</Text>
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            </View>
          </Swipeable>

          {reactionEntries.length > 0 ? (
            <View style={styles.reactionsRow}>
              {reactionEntries.map(([emoji, count]) => (
                <View
                  key={`${item.id}-${emoji}`}
                  style={[styles.reactionChip, item.current_user_reaction === emoji && styles.reactionChipMine]}
                  accessibilityLabel={`${emoji} ${count}${item.current_user_reaction === emoji ? ", including you" : ""}`}
                >
                  <Text style={styles.reactionChipText}>
                    {emoji} {count}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {showTranslate ? (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onTranslate(item);
              }}
              style={({ pressed }) => [styles.translateChip, pressed && { opacity: 0.8 }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Translate this message"
            >
              <Ionicons name="language-outline" size={14} color={warm.teal} />
              <Text style={styles.translateChipText}>Translate</Text>
            </Pressable>
          ) : null}

          {endsGroup ? (
            <View style={styles.messageMetaRow}>
              <Text style={styles.messageTime}>{timeLabel}</Text>
              {isMine && isPending ? (
                <Ionicons name="time-outline" size={13} color={warm.mutedInk} accessibilityLabel="Sending" />
              ) : isMine ? (
                <Text
                  style={[styles.statusTick, item.status === "read" && styles.statusTickRead]}
                  accessibilityLabel={tickLabel}
                >
                  {statusTicks(item.status)}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </>
  );
}

/** One chat message row; re-renders only when its message object or flags change. */
export const MessageRow = React.memo(MessageRowComponent);
