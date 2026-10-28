import React, { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type AccessibilityActionEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  GestureDetector,
  useCompetingGestures,
  useExclusiveGestures,
  useLongPressGesture,
  useTapGesture,
} from "react-native-gesture-handler";
import Swipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  FadeIn,
  FadeInDown,
  LayoutAnimationConfig,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
  ZoomIn,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Ionicons } from "@expo/vector-icons";
import { hapticLight } from "../../services/haptics";
import type { WarmColors } from "../../theme/warm";
import type { ChatMessage } from "../../types";
import { attachmentLabel, getAttachmentKind } from "./attachments";
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

/** Swipe distance (dp) that triggers reply on release; the haptic tick fires when it is crossed. */
const REPLY_SWIPE_TRIGGER = 32;
const LONG_PRESS_MS = 450;
const DOUBLE_TAP_MAX_DELAY_MS = 250;

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
  /** Bumped by each jump to this message (search, pinned, reply quote); 0 = no highlight. */
  highlightNonce: number;
  /** Trimmed search query when this message is a search result, else null. */
  searchHighlight: string | null;
  isActiveSearchMatch: boolean;
  /** Quote text for `reply_to` (resolved by the screen so attachments get a label), else null. */
  replyPreview: string | null;
  /** Double-tap translates (received text messages only). */
  canTranslate: boolean;
  /** Translation shown under the original text, or null. */
  translatedText: string | null;
  translating: boolean;
  /** Fresh message (sent or received since the chat opened): the bubble fades/slides in once. */
  animateIn: boolean;
  styles: ChatStyles;
  warm: WarmColors;
  // Handlers must be stable (the row is memoized).
  onSwipeReply: (message: ChatMessage) => void;
  onReactionSelect: (message: ChatMessage, emoji: string) => void;
  onOpenMenu: (message: ChatMessage, isMine: boolean) => void;
  onTap: (message: ChatMessage) => void;
  /** Double-tap / "Show original" / a11y action: toggles the inline translation. */
  onToggleTranslation: (message: ChatMessage) => void;
  /** Opens the full-screen viewer with the original image URL. */
  onOpenImage: (url: string) => void;
};

type BubbleTouchAreaProps = {
  enabled: boolean;
  doubleTapEnabled: boolean;
  onTap: () => void;
  onDoubleTap: () => void;
  onLongPress: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Tap / double-tap / long-press on (part of) a bubble, recognised natively by Gesture Handler:
 * long press races the taps, and the single tap waits for the double tap to fail only when
 * double-tap is enabled (received text), so own messages get instant single taps. Attachments
 * and "Show original" stay outside these areas so their own presses never double-fire.
 * Movement beyond 10 dp fails every gesture, so list scrolling and swipe-to-reply win.
 */
function BubbleTouchArea({ enabled, doubleTapEnabled, onTap, onDoubleTap, onLongPress, style, children }: BubbleTouchAreaProps) {
  // Latest handlers without re-configuring the native gestures on every render.
  const handlers = useRef({ onTap, onDoubleTap, onLongPress });
  handlers.current = { onTap, onDoubleTap, onLongPress };

  const doubleTap = useTapGesture(
    useMemo(
      () => ({
        enabled: enabled && doubleTapEnabled,
        numberOfTaps: 2,
        maxDelay: DOUBLE_TAP_MAX_DELAY_MS,
        maxDistance: 10,
        runOnJS: true,
        onActivate: () => handlers.current.onDoubleTap(),
      }),
      [doubleTapEnabled, enabled]
    )
  );
  const singleTap = useTapGesture(
    useMemo(
      () => ({
        enabled,
        maxDistance: 10,
        maxDuration: LONG_PRESS_MS,
        runOnJS: true,
        onActivate: () => handlers.current.onTap(),
      }),
      [enabled]
    )
  );
  const longPress = useLongPressGesture(
    useMemo(
      () => ({
        enabled,
        minDuration: LONG_PRESS_MS,
        maxDistance: 10,
        runOnJS: true,
        onActivate: () => handlers.current.onLongPress(),
      }),
      [enabled]
    )
  );
  const taps = useExclusiveGestures(doubleTap, singleTap);
  const gesture = useCompetingGestures(longPress, taps);

  return (
    <GestureDetector gesture={gesture}>
      <View style={style}>{children}</View>
    </GestureDetector>
  );
}

/** Reply icon behind a swiped bubble: grows with the drag; light haptic when the trigger is crossed. */
function ReplySwipeAction({
  translation,
  isMine,
  styles,
  color,
}: {
  translation: SharedValue<number>;
  isMine: boolean;
  styles: ChatStyles;
  color: string;
}) {
  useAnimatedReaction(
    () => Math.abs(translation.value) >= REPLY_SWIPE_TRIGGER,
    (crossed, previous) => {
      if (crossed && previous === false) scheduleOnRN(hapticLight);
    }
  );
  const iconStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.abs(translation.value) / REPLY_SWIPE_TRIGGER);
    return { opacity: progress, transform: [{ scale: 0.6 + 0.4 * progress }] };
  });
  return (
    <View style={styles.replySwipeAction}>
      <Animated.View style={iconStyle}>
        <Ionicons name={isMine ? "arrow-undo" : "arrow-redo"} size={18} color={color} />
      </Animated.View>
    </View>
  );
}

/** Teal outline pulse over a bubble after a jump (UI thread; a static outline with reduced motion). */
function HighlightOverlay({ nonce, styles }: { nonce: number; styles: ChatStyles }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.985);
  useEffect(() => {
    if (!nonce) return;
    if (reduceMotion) {
      // Static outline until the screen clears the highlight (~1.3 s).
      opacity.value = 1;
      scale.value = 1;
      return;
    }
    opacity.value = 0;
    scale.value = 0.985;
    opacity.value = withSequence(withTiming(1, { duration: 170 }), withTiming(0, { duration: 1050 }));
    scale.value = withTiming(1, { duration: 220 });
  }, [nonce, opacity, reduceMotion, scale]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return <Animated.View pointerEvents="none" style={[styles.messageBubbleHighlightOverlay, style]} />;
}

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
  highlightNonce,
  searchHighlight,
  isActiveSearchMatch,
  replyPreview,
  canTranslate,
  translatedText,
  translating,
  animateIn,
  styles,
  warm,
  onSwipeReply,
  onReactionSelect,
  onOpenMenu,
  onTap,
  onToggleTranslation,
  onOpenImage,
}: MessageRowProps) {
  const swipeableRef = useRef<SwipeableMethods | null>(null);
  const attachmentUrl = item.attachment_url || null;
  const attachmentKind = getAttachmentKind(attachmentUrl, item.local_mime_type);
  // Optimistic bubble of an attachment upload: not interactive until the server message replaces it.
  const isPending = item.local_status === "sending";
  const hasText = Boolean((item.text || "").trim());
  const showText = hasText || !attachmentUrl;
  const hasAttachment = Boolean(attachmentUrl && attachmentKind);

  const handleTap = useCallback(() => onTap(item), [item, onTap]);
  const handleDoubleTap = useCallback(() => {
    if (canTranslate) onToggleTranslation(item);
  }, [canTranslate, item, onToggleTranslation]);
  const handleLongPress = useCallback(() => {
    if (!isPending) onOpenMenu(item, isMine);
  }, [isMine, isPending, item, onOpenMenu]);
  const handleAttachmentLongPress = useCallback(
    (_pageY: number) => handleLongPress(),
    [handleLongPress]
  );
  const handleShowOriginal = useCallback(() => onToggleTranslation(item), [item, onToggleTranslation]);

  const reactionEntries = useMemo(() => {
    const groupedReactions = (item.reactions || []).reduce<Record<string, number>>((acc, reaction) => {
      acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(groupedReactions);
  }, [item.reactions]);

  const replyAuthor =
    item.reply_to?.sender?.id === currentUserId ? "You" : item.reply_to?.sender?.username || "User";

  const handleSwipeOpen = useCallback(
    (direction: "left" | "right") => {
      if ((isMine && direction !== "right") || (!isMine && direction !== "left")) return;
      swipeableRef.current?.close();
      onSwipeReply(item);
    },
    [isMine, item, onSwipeReply]
  );

  const renderReplySwipeAction = useCallback(
    (_progress: SharedValue<number>, translation: SharedValue<number>) => (
      <ReplySwipeAction translation={translation} isMine={isMine} styles={styles} color={warm.teal} />
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

  // Screen reader: one summary per bubble + actions (tap, menu, reply, translate).
  const a11yLabel = useMemo(() => {
    const parts = [isMine ? "You" : avatarName || "Message"];
    if (item.reply_to) parts.push(`replying to ${replyAuthor}`);
    if (hasAttachment && attachmentKind) parts.push(attachmentLabel(attachmentKind));
    if (hasText) parts.push(String(item.text));
    if (translatedText) parts.push(`Translation: ${translatedText}`);
    if (item.edited_at) parts.push("edited");
    if (item.is_pinned) parts.push("pinned");
    parts.push(timeLabel);
    if (isMine) parts.push(isPending ? "sending" : tickLabel.toLowerCase());
    return parts.filter(Boolean).join(", ");
  }, [
    attachmentKind,
    avatarName,
    hasAttachment,
    hasText,
    isMine,
    isPending,
    item.edited_at,
    item.is_pinned,
    item.reply_to,
    item.text,
    replyAuthor,
    tickLabel,
    timeLabel,
    translatedText,
  ]);
  const a11yActions = useMemo(() => {
    if (isPending) return undefined;
    const actions: { name: string; label?: string }[] = [
      { name: "activate" },
      { name: "longpress", label: "Message options" },
      { name: "reply", label: "Reply" },
    ];
    if (canTranslate) actions.push({ name: "translate", label: translatedText ? "Show original" : "Translate" });
    return actions;
  }, [canTranslate, isPending, translatedText]);
  const handleA11yAction = useCallback(
    (event: AccessibilityActionEvent) => {
      switch (event.nativeEvent.actionName) {
        case "activate":
          handleTap();
          break;
        case "longpress":
          handleLongPress();
          break;
        case "reply":
          onSwipeReply(item);
          break;
        case "translate":
          onToggleTranslation(item);
          break;
      }
    },
    [handleLongPress, handleTap, item, onSwipeReply, onToggleTranslation]
  );

  const showTranslationFooter = Boolean(translatedText);
  const touchEnabled = !isPending;

  const replySnippet = item.reply_to ? (
    <View style={styles.replySnippet}>
      <Text numberOfLines={1} style={styles.replySnippetAuthor}>
        {replyAuthor}
      </Text>
      <Text numberOfLines={2} style={styles.replySnippetText}>
        {replyPreview ?? toReplyPreviewText(item.reply_to)}
      </Text>
    </View>
  ) : null;

  const textBlock = (
    <>
      {showText ? (
        <Text
          style={[styles.messageText, hasAttachment ? styles.attachmentCaption : null]}
          textBreakStrategy="highQuality"
          android_hyphenationFrequency="normal"
          lineBreakStrategyIOS="standard"
        >
          {messageText}
        </Text>
      ) : null}
      {translating ? (
        <View style={styles.translationLoading} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={warm.teal} />
          <Text style={styles.translationMeta}>Translating…</Text>
        </View>
      ) : null}
      {translatedText ? (
        <Animated.View entering={FadeIn.duration(180)} style={styles.translationBlock}>
          <View style={styles.translationDivider} />
          <Text
            style={styles.translationText}
            textBreakStrategy="highQuality"
            android_hyphenationFrequency="normal"
            lineBreakStrategyIOS="standard"
          >
            {translatedText}
          </Text>
        </Animated.View>
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
    </>
  );

  // Touch areas extend over the bubble padding (negative margins) so the whole bubble responds,
  // except the attachment and the translation footer, which handle their own presses.
  const touchProps = {
    enabled: touchEnabled,
    doubleTapEnabled: canTranslate,
    onTap: handleTap,
    onDoubleTap: handleDoubleTap,
    onLongPress: handleLongPress,
  };
  const hasTextSection = showText || translating || Boolean(translatedText) || item.is_pinned || Boolean(item.edited_at);

  let bubbleContent: ReactNode;
  if (!hasAttachment) {
    bubbleContent = (
      <BubbleTouchArea
        {...touchProps}
        style={[styles.bubbleTouch, styles.bubbleTouchTop, !showTranslationFooter && styles.bubbleTouchBottom]}
      >
        {replySnippet}
        {textBlock}
      </BubbleTouchArea>
    );
  } else {
    bubbleContent = (
      <>
        {replySnippet ? (
          <BubbleTouchArea {...touchProps} style={[styles.bubbleTouch, styles.bubbleTouchTop]}>
            {replySnippet}
          </BubbleTouchArea>
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
        {hasTextSection ? (
          <BubbleTouchArea
            {...touchProps}
            style={[styles.bubbleTouch, !showTranslationFooter && styles.bubbleTouchBottom]}
          >
            {textBlock}
          </BubbleTouchArea>
        ) : null}
      </>
    );
  }

  const row = (
    <>
      {dayLabel != null ? (
        <View style={styles.daySeparatorRow} accessibilityRole="header">
          <View style={styles.daySeparatorPill}>
            <Text style={styles.daySeparatorText}>{dayLabel}</Text>
          </View>
        </View>
      ) : null}
      {showUnreadDivider ? (
        <View style={styles.unreadDividerRow} accessible accessibilityLabel="Unread messages below">
          <View style={styles.unreadDividerLine} />
          <Text style={styles.unreadDividerText}>Unread messages</Text>
          <View style={styles.unreadDividerLine} />
        </View>
      ) : null}
      <Animated.View
        entering={FadeInDown.duration(200)}
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
            leftThreshold={REPLY_SWIPE_TRIGGER}
            rightThreshold={REPLY_SWIPE_TRIGGER}
            dragOffsetFromLeft={8}
            dragOffsetFromRight={-8}
            containerStyle={styles.swipeContainer}
            childrenContainerStyle={styles.swipeChildren}
            renderLeftActions={!isMine ? renderReplySwipeAction : undefined}
            renderRightActions={isMine ? renderReplySwipeAction : undefined}
            onSwipeableWillOpen={handleSwipeOpen}
            enabled={!isPending}
          >
            <View style={styles.messageContainer}>
              {showReactionPicker ? (
                <Animated.View
                  entering={ZoomIn.duration(160)}
                  style={[styles.reactionPicker, isMine ? styles.reactionPickerRight : styles.reactionPickerLeft]}
                >
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
                </Animated.View>
              ) : null}
              <View
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
                // Attachment bubbles keep their inner photo/voice/file buttons reachable.
                accessible={!hasAttachment}
                accessibilityLabel={!hasAttachment ? a11yLabel : undefined}
                accessibilityHint={
                  !hasAttachment && !isPending
                    ? canTranslate
                      ? "Actions: options, reply, translate"
                      : "Actions: options, reply"
                    : undefined
                }
                accessibilityActions={!hasAttachment ? a11yActions : undefined}
                onAccessibilityAction={!hasAttachment ? handleA11yAction : undefined}
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
                {highlightNonce ? <HighlightOverlay nonce={highlightNonce} styles={styles} /> : null}
                {bubbleContent}
                {showTranslationFooter ? (
                  <Pressable
                    onPress={handleShowOriginal}
                    style={({ pressed }) => [styles.translationFooter, pressed && styles.translationFooterPressed]}
                    hitSlop={{ top: 4, bottom: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Show original message"
                  >
                    <Ionicons name="language-outline" size={12} color={warm.mutedInk} />
                    <Text style={styles.translationMeta}>
                      Translated · <Text style={styles.translationShowOriginal}>Show original</Text>
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </Swipeable>

          {reactionEntries.length > 0 ? (
            <View style={styles.reactionsRow}>
              {reactionEntries.map(([emoji, count]) => (
                <Animated.View
                  key={`${item.id}-${emoji}`}
                  entering={ZoomIn.springify().damping(14)}
                  style={[styles.reactionChip, item.current_user_reaction === emoji && styles.reactionChipMine]}
                  accessible
                  accessibilityLabel={`${emoji} ${count}${item.current_user_reaction === emoji ? ", including you" : ""}`}
                >
                  <Text style={styles.reactionChipText}>
                    {emoji} {count}
                  </Text>
                </Animated.View>
              ))}
            </View>
          ) : null}

          {endsGroup ? (
            <View
              style={styles.messageMetaRow}
              // Text bubbles already announce time and status in their label.
              importantForAccessibility={hasAttachment ? "auto" : "no-hide-descendants"}
              accessibilityElementsHidden={!hasAttachment}
            >
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
      </Animated.View>
    </>
  );

  // Entering animations (bubble, reaction chips, translation, picker) run only for content that
  // appears while the row is mounted — not when a virtualized cell re-mounts on scroll. A fresh
  // message also animates its bubble in once.
  return <LayoutAnimationConfig skipEntering={!animateIn}>{row}</LayoutAnimationConfig>;
}

/** One chat message row; re-renders only when its message object or flags change. */
export const MessageRow = React.memo(MessageRowComponent);
