import React, { useMemo, type ReactNode, type RefObject } from "react";
import {
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  type LayoutChangeEvent,
  type TextInputInstance,
  View,
  type ListRenderItem,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, { ZoomIn, ZoomOut } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ChatStyles } from "../../components/chat/chatStyles";
import { Composer, type ComposerHandle } from "../../components/chat/Composer";
import type { PickedAttachment } from "../../components/chat/attachments";
import { unreadBadgeText } from "../../components/chat/conversationList";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";
import type { ChatMessage, ConversationParticipant } from "../../types";
import { ChatHeader } from "./ChatHeader";
import {
  useChatScrollComponent,
  useStickyOffset,
  useTabBarOffset,
  type ChatContentInsets,
} from "./chatKeyboard";
import { PinnedBar } from "./PinnedBar";

// Optimistic photo bubbles keep the key of the bubble they replace (`local_key`), so the saved
// message reuses the same cell: no remount, no second entry animation, no thumbnail flash.
const messageKeyExtractor = (item: ChatMessage) => item.local_key ?? String(item.id);

export type { ChatContentInsets };

type ChatRoomViewProps = {
  warm: WarmColors;
  chatStyles: ChatStyles;
  reduceMotion: boolean;
  onTouchEndCapture: () => void;
  // Header
  otherUser: ConversationParticipant;
  isOnline: boolean;
  isTyping: boolean;
  optionsLoading: boolean;
  onBack: () => void;
  onOpenProfile: () => void;
  onOpenOptions: () => void;
  // Search
  searchOpen: boolean;
  searchInputRef: RefObject<TextInputInstance | null>;
  searchQuery: string;
  searchResultLabel: string;
  searchHasResults: boolean;
  onToggleSearch: () => void;
  onSearchQueryChange: (value: string) => void;
  onSearchSubmit: () => void;
  onSearchPrevious: () => void;
  onSearchNext: () => void;
  onCloseSearch: () => void;
  // Pins
  pinnedMessages: ChatMessage[];
  showPinnedList: boolean;
  onOpenPinnedList: () => void;
  onClosePinnedList: () => void;
  onJumpToPinned: (message: ChatMessage) => void;
  onUnpin: (message: ChatMessage) => void;
  // Messages
  loadingConversation: boolean;
  messageListRef: RefObject<FlatList<ChatMessage> | null>;
  messages: ChatMessage[];
  renderMessage: ListRenderItem<ChatMessage>;
  loadingOlderMessages: boolean;
  refreshingConversation: boolean;
  onRefresh: () => void;
  onContentSizeChange: (width: number, height: number) => void;
  onListLayout: (event: LayoutChangeEvent) => void;
  /** Keyboard-driven bottom inset of the list (keyboard-controller), for inset-aware scrollToEnd. */
  onContentInsetChange: (insets: ChatContentInsets) => void;
  onScrollToIndexFailed: (info: { index: number; averageItemLength: number }) => void;
  onScrollBeginDrag: () => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  showJumpToLatest: boolean;
  jumpUnreadCount: number;
  onJumpToLatest: () => void;
  // Composer
  composerRef: RefObject<ComposerHandle | null>;
  currentUserId?: number;
  replyTarget: ChatMessage | null;
  sending: boolean;
  onClearReply: () => void;
  onComposerFocus: () => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onSend: (text: string, attachment: PickedAttachment | null) => Promise<boolean>;
  /** Sheets, modals and the photo viewer. */
  children?: ReactNode;
};

/**
 * Open chat: header (+ search), pinned bar, message list, jump-to-latest and composer.
 *
 * Keyboard: see `chatKeyboard.tsx` (list in a KeyboardChatScrollView, composer and jump button in
 * KeyboardStickyViews, both offset by the covered tab bar).
 */
export function ChatRoomView(props: ChatRoomViewProps) {
  const { warm } = props;
  const styles = useMemo(() => createStyles(warm), [warm]);
  const tabBarOffset = useTabBarOffset();
  const stickyOffset = useStickyOffset(tabBarOffset);
  const renderScrollComponent = useChatScrollComponent(tabBarOffset, props.onContentInsetChange);

  // Stable elements so header/presence/typing re-renders of this view don't re-render the list.
  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={props.refreshingConversation}
        onRefresh={props.onRefresh}
        tintColor={warm.teal}
        colors={[warm.teal]}
      />
    ),
    [props.onRefresh, props.refreshingConversation, warm.teal]
  );
  const listHeader = useMemo(
    () =>
      props.loadingOlderMessages ? (
        <View style={styles.olderLoader} accessibilityLabel="Loading older messages" accessible>
          <ActivityIndicator size="small" color={warm.teal} />
        </View>
      ) : undefined,
    [props.loadingOlderMessages, styles.olderLoader, warm.teal]
  );
  const listFooter = useMemo(() => <View style={styles.footerSpacer} />, [styles.footerSpacer]);
  const otherName = props.otherUser.username;
  const listEmpty = useMemo(
    () => (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Text style={styles.emptyWave} accessibilityElementsHidden importantForAccessibility="no">
            👋
          </Text>
        </View>
        <Text style={styles.emptyTitle}>Say hello to {otherName}</Text>
        <Text style={styles.emptyText}>
          Start with a greeting in the language you’re practising — double-tap any message they send to
          translate it.
        </Text>
      </View>
    ),
    [otherName, styles]
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.flex} onTouchEndCapture={props.onTouchEndCapture}>
        <ChatHeader
          warm={warm}
          otherUser={props.otherUser}
          isOnline={props.isOnline}
          isTyping={props.isTyping}
          optionsLoading={props.optionsLoading}
          onBack={props.onBack}
          onOpenProfile={props.onOpenProfile}
          onOpenOptions={props.onOpenOptions}
          searchOpen={props.searchOpen}
          searchInputRef={props.searchInputRef}
          searchQuery={props.searchQuery}
          searchResultLabel={props.searchResultLabel}
          searchHasResults={props.searchHasResults}
          onToggleSearch={props.onToggleSearch}
          onSearchQueryChange={props.onSearchQueryChange}
          onSearchSubmit={props.onSearchSubmit}
          onSearchPrevious={props.onSearchPrevious}
          onSearchNext={props.onSearchNext}
          onCloseSearch={props.onCloseSearch}
        />

        <PinnedBar
          warm={warm}
          pinnedMessages={props.pinnedMessages}
          showList={props.showPinnedList}
          reduceMotion={props.reduceMotion}
          onOpenList={props.onOpenPinnedList}
          onCloseList={props.onClosePinnedList}
          onJump={props.onJumpToPinned}
          onUnpin={props.onUnpin}
        />

        <View style={styles.messagesArea}>
          {props.loadingConversation ? (
            <View style={styles.loading}>
              <ActivityIndicator color={warm.teal} />
            </View>
          ) : (
            <FlatList
              ref={props.messageListRef}
              data={props.messages}
              keyExtractor={messageKeyExtractor}
              renderItem={props.renderMessage}
              renderScrollComponent={renderScrollComponent}
              onContentSizeChange={props.onContentSizeChange}
              onLayout={props.onListLayout}
              // Keeps the visible message in place when older messages are prepended.
              maintainVisibleContentPosition={MAINTAIN_POSITION}
              ListHeaderComponent={listHeader}
              ListFooterComponent={listFooter}
              ListEmptyComponent={listEmpty}
              onScrollToIndexFailed={props.onScrollToIndexFailed}
              refreshControl={refreshControl}
              contentContainerStyle={styles.messagesContent}
              onScrollBeginDrag={props.onScrollBeginDrag}
              onScroll={props.onScroll}
              scrollEventThrottle={16}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              // Rows are variable-height bubbles: render a screenful first, then small batches.
              initialNumToRender={16}
              maxToRenderPerBatch={10}
              updateCellsBatchingPeriod={40}
              windowSize={11}
              removeClippedSubviews={Platform.OS === "android"}
            />
          )}

          <KeyboardStickyView offset={stickyOffset} style={styles.jumpSticky} pointerEvents="box-none">
            {props.showJumpToLatest ? (
              <Animated.View entering={ZoomIn.duration(150)} exiting={ZoomOut.duration(120)}>
                <Pressable
                  style={({ pressed }) => [styles.jumpButton, pressed && styles.pressed]}
                  onPress={props.onJumpToLatest}
                  accessibilityRole="button"
                  accessibilityLabel={
                    props.jumpUnreadCount > 0
                      ? `Jump to latest, ${props.jumpUnreadCount} new ${props.jumpUnreadCount === 1 ? "message" : "messages"}`
                      : "Jump to latest message"
                  }
                >
                  <Ionicons name="arrow-down" size={22} color={warm.ink} />
                  {props.jumpUnreadCount > 0 ? (
                    <View style={styles.jumpBadge}>
                      <Text style={styles.jumpBadgeText}>{unreadBadgeText(props.jumpUnreadCount)}</Text>
                    </View>
                  ) : null}
                </Pressable>
              </Animated.View>
            ) : null}
          </KeyboardStickyView>
        </View>

        <KeyboardStickyView offset={stickyOffset} style={styles.composerSticky}>
          <Composer
            ref={props.composerRef}
            styles={props.chatStyles}
            warm={warm}
            currentUserId={props.currentUserId}
            replyTarget={props.replyTarget}
            sending={props.sending}
            onClearReply={props.onClearReply}
            onFocus={props.onComposerFocus}
            onTypingStart={props.onTypingStart}
            onTypingStop={props.onTypingStop}
            onSend={props.onSend}
          />
        </KeyboardStickyView>
      </View>
      {props.children}
    </SafeAreaView>
  );
}

const MAINTAIN_POSITION = { minIndexForVisible: 0 };

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: {
      flex: 1,
      backgroundColor: warm.paper,
    },
    messagesArea: {
      flex: 1,
      position: "relative",
    },
    loading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    messagesContent: {
      paddingHorizontal: 12,
      paddingTop: 8,
      flexGrow: 1,
    },
    footerSpacer: {
      height: 14,
    },
    olderLoader: {
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      paddingVertical: 40,
      gap: 8,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.peachSoft,
      marginBottom: 4,
    },
    emptyWave: {
      fontSize: 30,
    },
    emptyTitle: {
      color: warm.ink,
      fontSize: 18,
      textAlign: "center",
      fontFamily: fontFamilies.displaySemiBold,
    },
    emptyText: {
      color: warm.mutedInk,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      fontFamily: fontFamilies.bodyMedium,
    },
    jumpSticky: {
      position: "absolute",
      right: 14,
      bottom: 12,
      zIndex: 20,
    },
    composerSticky: {
      zIndex: 10,
    },
    jumpButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.paper,
      shadowColor: warm.shadow,
      shadowOpacity: 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 5,
    },
    jumpBadge: {
      position: "absolute",
      top: -6,
      right: -4,
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.badge,
    },
    jumpBadgeText: {
      color: warm.onBadge,
      fontSize: 12,
      fontFamily: fontFamilies.bodyExtraBold,
    },
    pressed: {
      opacity: 0.85,
    },
  });
