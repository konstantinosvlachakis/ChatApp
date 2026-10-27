import React, { useMemo, type ReactNode, type RefObject } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  type TextInputInstance,
  View,
  type ListRenderItem,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ChatStyles } from "../../components/chat/chatStyles";
import { Composer, type ComposerHandle } from "../../components/chat/Composer";
import type { PickedAttachment } from "../../components/chat/attachments";
import { unreadBadgeText } from "../../components/chat/conversationList";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";
import type { ChatMessage, ConversationParticipant } from "../../types";
import { ChatHeader } from "./ChatHeader";
import { PinnedBar } from "./PinnedBar";

const messageKeyExtractor = (item: ChatMessage) => String(item.id);

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
  onContentSizeChange: () => void;
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

/** Open chat: header (+ search), pinned bar, message list, jump-to-latest and composer. */
export function ChatRoomView(props: ChatRoomViewProps) {
  const { warm } = props;
  const styles = useMemo(() => createStyles(warm), [warm]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        onTouchEndCapture={props.onTouchEndCapture}
      >
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
              onContentSizeChange={props.onContentSizeChange}
              // Keeps the visible message in place when older messages are prepended.
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              ListHeaderComponent={
                props.loadingOlderMessages ? (
                  <ActivityIndicator style={styles.olderLoader} color={warm.teal} />
                ) : undefined
              }
              onScrollToIndexFailed={props.onScrollToIndexFailed}
              ListFooterComponent={<View style={styles.footerSpacer} />}
              refreshControl={
                <RefreshControl
                  refreshing={props.refreshingConversation}
                  onRefresh={props.onRefresh}
                  tintColor={warm.teal}
                  colors={[warm.teal]}
                />
              }
              contentContainerStyle={styles.messagesContent}
              onScrollBeginDrag={props.onScrollBeginDrag}
              onScroll={props.onScroll}
              scrollEventThrottle={16}
            />
          )}

          {props.showJumpToLatest ? (
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
          ) : null}
        </View>

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
      </KeyboardAvoidingView>
      {props.children}
    </SafeAreaView>
  );
}

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
    },
    footerSpacer: {
      height: 14,
    },
    olderLoader: {
      paddingVertical: 10,
    },
    jumpButton: {
      position: "absolute",
      right: 14,
      bottom: 12,
      zIndex: 20,
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
