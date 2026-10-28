import { StyleSheet } from "react-native";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";

/** Rendered size (dp) of the avatar beside a received group (also passed to avatarImage). */
export const MESSAGE_AVATAR_SIZE = 28;
/** Bubble padding; touch areas inside the bubble extend over it with negative margins. */
export const BUBBLE_PADDING_X = 14;
export const BUBBLE_PADDING_Y = 10;
const BUBBLE_RADIUS = 20;
const JOINED_RADIUS = 6;

/**
 * Styles shared by MessageRow, MessageAttachment and Composer. Created once per theme by the chat
 * screen and passed down (a stable object, so memoized rows don't re-render).
 */
export const createChatStyles = (warm: WarmColors) =>
  StyleSheet.create({
    // ---- Separators
    daySeparatorRow: {
      alignItems: "center",
      marginTop: 14,
      marginBottom: 4,
    },
    daySeparatorPill: {
      borderRadius: 999,
      backgroundColor: warm.creamDeep,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    daySeparatorText: {
      color: warm.inkSoft,
      fontSize: 12,
      fontFamily: fontFamilies.bodyBold,
    },
    unreadDividerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 10,
      marginBottom: 2,
    },
    unreadDividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: warm.lineWarm,
    },
    unreadDividerText: {
      color: warm.peachInk,
      fontSize: 12,
      fontFamily: fontFamilies.bodyExtraBold,
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },

    // ---- Row layout
    messageRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      marginTop: 2,
    },
    messageRowStartsGroup: {
      marginTop: 12,
    },
    messageRowMine: {
      justifyContent: "flex-end",
    },
    messageRowOther: {
      justifyContent: "flex-start",
    },
    avatarSlot: {
      width: MESSAGE_AVATAR_SIZE,
      marginRight: 8,
      marginBottom: 2,
    },
    messageColumn: {
      maxWidth: "78%",
      minWidth: 0,
    },
    messageColumnMine: {
      alignItems: "flex-end",
    },
    messageColumnOther: {
      alignItems: "flex-start",
    },
    swipeContainer: {
      overflow: "visible",
    },
    swipeChildren: {
      overflow: "visible",
    },
    messageContainer: {
      position: "relative",
      maxWidth: "100%",
    },
    replySwipeAction: {
      width: 44,
      alignItems: "center",
      justifyContent: "center",
    },

    // ---- Reaction picker (above the bubble)
    reactionPicker: {
      position: "absolute",
      top: -50,
      zIndex: 20,
      flexDirection: "row",
      gap: 2,
      backgroundColor: warm.paper,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      borderRadius: 999,
      paddingHorizontal: 4,
      paddingVertical: 2,
      shadowColor: warm.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    reactionPickerLeft: {
      left: 0,
    },
    reactionPickerRight: {
      right: 0,
    },
    reactionPickerItem: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    reactionPickerItemActive: {
      backgroundColor: warm.peach,
    },
    reactionPickerEmoji: {
      fontSize: 22,
    },

    // ---- Bubble
    messageBubble: {
      maxWidth: "100%",
      borderRadius: BUBBLE_RADIUS,
      paddingHorizontal: BUBBLE_PADDING_X,
      paddingVertical: BUBBLE_PADDING_Y,
    },
    // Gesture areas (tap / double-tap / long-press) cover the bubble padding too.
    bubbleTouch: {
      marginHorizontal: -BUBBLE_PADDING_X,
      paddingHorizontal: BUBBLE_PADDING_X,
    },
    bubbleTouchTop: {
      marginTop: -BUBBLE_PADDING_Y,
      paddingTop: BUBBLE_PADDING_Y,
    },
    bubbleTouchBottom: {
      marginBottom: -BUBBLE_PADDING_Y,
      paddingBottom: BUBBLE_PADDING_Y,
    },
    messageMine: {
      backgroundColor: warm.bubbleOut,
      borderBottomRightRadius: JOINED_RADIUS,
    },
    messageMineJoinedTop: {
      borderTopRightRadius: JOINED_RADIUS,
    },
    messageOther: {
      backgroundColor: warm.bubbleIn,
      borderBottomLeftRadius: JOINED_RADIUS,
    },
    messageOtherJoinedTop: {
      borderTopLeftRadius: JOINED_RADIUS,
    },
    messageBubblePending: {
      opacity: 0.85,
    },
    messageBubbleReplyActiveMine: {
      transform: [{ translateX: -18 }],
    },
    messageBubbleReplyActiveOther: {
      transform: [{ translateX: 18 }],
    },
    messageBubbleActiveSearch: {
      borderWidth: 2,
      borderColor: warm.teal,
    },
    messageBubbleHighlightOverlay: {
      ...StyleSheet.absoluteFill,
      borderRadius: BUBBLE_RADIUS,
      borderWidth: 2,
      borderColor: warm.teal,
    },
    replyActiveIndicator: {
      position: "absolute",
      top: -8,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.paper,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      zIndex: 2,
    },
    replyActiveIndicatorMine: {
      right: -8,
    },
    replyActiveIndicatorOther: {
      left: -8,
    },
    messageText: {
      color: warm.ink,
      fontSize: 15,
      lineHeight: 22,
      flexShrink: 1,
      fontFamily: fontFamilies.bodyMedium,
    },
    inlineHighlight: {
      backgroundColor: warm.mark,
      color: warm.ink,
    },
    inlineHighlightActive: {
      backgroundColor: warm.markActive,
    },
    messageFlagRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 6,
    },
    messageFlagText: {
      color: warm.inkSoft,
      fontSize: 12,
      fontFamily: fontFamilies.bodyBold,
    },

    // ---- Reply quote inside a bubble
    replySnippet: {
      borderLeftWidth: 3,
      borderLeftColor: warm.teal,
      borderRadius: 10,
      backgroundColor: warm.quote,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginBottom: 8,
    },
    replySnippetAuthor: {
      color: warm.teal,
      fontSize: 12,
      fontFamily: fontFamilies.bodyExtraBold,
      marginBottom: 1,
    },
    replySnippetText: {
      color: warm.inkSoft,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fontFamilies.bodyMedium,
    },

    // ---- Under the bubble
    messageMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 4,
      paddingHorizontal: 4,
    },
    messageTime: {
      color: warm.mutedInk,
      fontSize: 12,
      fontFamily: fontFamilies.bodyMedium,
    },
    statusTick: {
      fontSize: 12,
      fontFamily: fontFamilies.bodyExtraBold,
      color: warm.mutedInk,
    },
    statusTickRead: {
      color: warm.teal,
    },
    reactionsRow: {
      marginTop: 4,
      flexDirection: "row",
      gap: 4,
      flexWrap: "wrap",
    },
    reactionChip: {
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.paper,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    reactionChipMine: {
      borderColor: warm.teal,
      backgroundColor: warm.sage,
    },
    reactionChipText: {
      fontSize: 13,
      color: warm.inkSoft,
      fontFamily: fontFamilies.bodyBold,
    },

    // ---- Inline translation (double-tap a received message)
    translationLoading: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 6,
      minHeight: 20,
    },
    translationBlock: {
      marginTop: 6,
    },
    translationDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: warm.lineWarm,
      marginBottom: 6,
    },
    translationText: {
      color: warm.ink,
      fontSize: 15,
      lineHeight: 22,
      flexShrink: 1,
      fontFamily: fontFamilies.bodyMedium,
    },
    translationFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginHorizontal: -BUBBLE_PADDING_X,
      marginBottom: -BUBBLE_PADDING_Y,
      paddingHorizontal: BUBBLE_PADDING_X,
      paddingTop: 6,
      paddingBottom: BUBBLE_PADDING_Y,
      minHeight: 32,
    },
    translationFooterPressed: {
      opacity: 0.7,
    },
    translationMeta: {
      color: warm.mutedInk,
      fontSize: 12,
      fontFamily: fontFamilies.bodyMedium,
    },
    translationShowOriginal: {
      color: warm.teal,
      fontFamily: fontFamilies.bodyBold,
    },

    // ---- Attachments
    // Fixed box (CHAT_IMAGE_BOX_* in MessageAttachment) so rows don't jump when the image loads.
    attachmentImageBox: {
      width: 220,
      height: 240,
      maxWidth: "100%",
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: warm.creamDeep,
    },
    attachmentImage: {
      width: "100%",
      height: "100%",
    },
    attachmentImageOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    attachmentImageSending: {
      backgroundColor: warm.imageScrim,
    },
    attachmentImageErrorText: {
      fontSize: 12,
      color: warm.mutedInk,
      fontFamily: fontFamilies.bodyMedium,
    },
    attachmentCaption: {
      marginTop: 8,
    },
    voiceNoteRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minWidth: 200,
      paddingVertical: 2,
    },
    voiceNoteButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.paper,
    },
    voiceNoteBody: {
      flex: 1,
      gap: 6,
    },
    voiceNoteTrack: {
      height: 4,
      borderRadius: 2,
      overflow: "hidden",
      backgroundColor: warm.line,
    },
    voiceNoteFill: {
      height: "100%",
      borderRadius: 2,
      backgroundColor: warm.teal,
    },
    voiceNoteTime: {
      color: warm.mutedInk,
      fontSize: 12,
      fontFamily: fontFamilies.bodyMedium,
    },
    fileChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minWidth: 180,
      maxWidth: 260,
      minHeight: 44,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: warm.quote,
    },
    fileChipTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    fileChipName: {
      color: warm.ink,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
    },
    fileChipMeta: {
      color: warm.mutedInk,
      fontSize: 12,
      marginTop: 2,
      fontFamily: fontFamilies.bodyMedium,
    },

    // ---- Composer
    composerWrap: {
      borderTopWidth: 1,
      borderTopColor: warm.line,
      backgroundColor: warm.paper,
      paddingTop: 6,
    },
    composerChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: 12,
      marginTop: 4,
      marginBottom: 2,
      paddingLeft: 12,
      paddingRight: 4,
      paddingVertical: 4,
      borderRadius: 18,
      backgroundColor: warm.peachSoft,
      borderWidth: 1,
      borderColor: warm.lineWarm,
    },
    composerChipAccent: {
      width: 3,
      alignSelf: "stretch",
      borderRadius: 2,
      backgroundColor: warm.teal,
    },
    composerChipThumb: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: warm.creamDeep,
    },
    composerChipTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    composerChipLabel: {
      color: warm.teal,
      fontSize: 12,
      fontFamily: fontFamilies.bodyExtraBold,
    },
    composerChipText: {
      color: warm.inkSoft,
      fontSize: 13,
      fontFamily: fontFamilies.bodyMedium,
    },
    composerChipClose: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    composerRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: 10,
      paddingTop: 6,
      paddingBottom: 8,
    },
    composerPill: {
      flex: 1,
      minHeight: 44,
      flexDirection: "row",
      alignItems: "flex-end",
      borderRadius: 22,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.cream,
      paddingLeft: 2,
      paddingRight: 14,
    },
    attachButton: {
      width: 40,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
    },
    composerInput: {
      flex: 1,
      minHeight: 42,
      maxHeight: 120,
      color: warm.ink,
      fontSize: 15,
      fontFamily: fontFamilies.bodyMedium,
      paddingTop: 11,
      paddingBottom: 11,
      paddingHorizontal: 4,
      textAlignVertical: "center",
    },
  });

export type ChatStyles = ReturnType<typeof createChatStyles>;
