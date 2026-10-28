import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { CoachAvatar } from "../../components/CoachAvatar";
import { ChatAvatar, chatAvatarUri } from "../../components/chat/ChatAvatar";
import {
  coachMatchesQuery,
  conversationPreview,
  filterConversations,
  formatListTime,
  getOtherParticipant,
  hasConversationWith,
  unreadBadgeText,
} from "../../components/chat/conversationList";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";
import type { Conversation } from "../../types";

export const LIST_AVATAR_SIZE = 48;

type ConversationListViewProps = {
  warm: WarmColors;
  /** Newest first. */
  conversations: Conversation[];
  currentUserId?: number;
  currentUsername?: string;
  onlineUserIds: Set<number>;
  typingByConversation: Record<number, boolean>;
  loadingList: boolean;
  coachLanguageValue: string;
  coachLanguageLabel: string;
  /** Search text; also the username for "Start a chat with …". */
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  creatingConversation: boolean;
  onStartConversation: () => void;
  onOpenConversation: (conversationId: number) => void;
  onOpenCoach: () => void;
  onFindPeople: () => void;
  onRefresh: () => Promise<void>;
};

const conversationKeyExtractor = (item: Conversation) => String(item.id);

// Avatars of the first screenful of chats are warmed into expo-image's memory/disk cache once per
// session (same sized URL as ChatAvatar requests), so rows and the chat header render without a pop.
const PREFETCH_AVATAR_COUNT = 12;
const prefetchedAvatarUris = new Set<string>();

export function ConversationListView({
  warm,
  conversations,
  currentUserId,
  currentUsername,
  onlineUserIds,
  typingByConversation,
  loadingList,
  coachLanguageValue,
  coachLanguageLabel,
  searchQuery,
  onSearchQueryChange,
  creatingConversation,
  onStartConversation,
  onOpenConversation,
  onOpenCoach,
  onFindPeople,
  onRefresh,
}: ConversationListViewProps) {
  const styles = useMemo(() => createStyles(warm), [warm]);
  // Spinner only for a user pull; background refetches don't flash it.
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const trimmedQuery = searchQuery.trim();
  const isSearching = Boolean(trimmedQuery);

  const visibleConversations = useMemo(
    () => filterConversations(conversations, searchQuery, currentUsername),
    [conversations, currentUsername, searchQuery]
  );
  const showCoach = coachMatchesQuery(searchQuery);
  const canStartChat =
    isSearching && !/\s/.test(trimmedQuery) && !hasConversationWith(conversations, trimmedQuery, currentUsername);
  const showSkeleton = loadingList && conversations.length === 0 && !isSearching;

  useEffect(() => {
    const uris: string[] = [];
    for (const conversation of conversations.slice(0, PREFETCH_AVATAR_COUNT)) {
      const path = getOtherParticipant(conversation, currentUsername).profile_image_url;
      const uri = chatAvatarUri(path, LIST_AVATAR_SIZE);
      if (uri && !prefetchedAvatarUris.has(uri)) {
        prefetchedAvatarUris.add(uri);
        uris.push(uri);
      }
    }
    if (uris.length) Image.prefetch(uris, "memory-disk").catch(() => {});
  }, [conversations, currentUsername]);

  const handleRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await onRefresh();
    } catch {
      // loadConversations surfaces errors through the API client toasts.
    } finally {
      setPullRefreshing(false);
    }
  }, [onRefresh]);

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => {
      const otherUser = getOtherParticipant(item, currentUsername);
      return (
        <ConversationRow
          conversation={item}
          otherUsername={otherUser.username}
          otherImagePath={otherUser.profile_image_url ?? null}
          isOnline={onlineUserIds.has(otherUser.id)}
          isTyping={Boolean(typingByConversation[item.id])}
          currentUserId={currentUserId}
          styles={styles}
          warm={warm}
          onPress={onOpenConversation}
        />
      );
    },
    [currentUserId, currentUsername, onOpenConversation, onlineUserIds, styles, typingByConversation, warm]
  );

  const listHeader = (
    <View>
      {canStartChat ? (
        <Pressable
          style={({ pressed }) => [styles.startRow, pressed && styles.pressed]}
          onPress={onStartConversation}
          disabled={creatingConversation}
          accessibilityRole="button"
          accessibilityLabel={`Start a chat with ${trimmedQuery}`}
          accessibilityState={{ busy: creatingConversation }}
        >
          <View style={styles.startIcon}>
            {creatingConversation ? (
              <ActivityIndicator size="small" color={warm.onNavy} />
            ) : (
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={warm.onNavy} />
            )}
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowName} numberOfLines={1}>
              Start a chat with “{trimmedQuery}”
            </Text>
            <Text style={styles.rowPreview} numberOfLines={1}>
              Opens your conversation by exact username
            </Text>
          </View>
        </Pressable>
      ) : null}

      {showCoach ? (
        <View style={styles.companion}>
          <Text style={styles.sectionLabel} accessibilityRole="header">
            Your practice companion
          </Text>
          <Pressable
            style={({ pressed }) => [styles.row, styles.coachRow, pressed && styles.pressed]}
            onPress={onOpenCoach}
            accessibilityRole="button"
            accessibilityLabel={`Lumi, AI coach. Practice ${coachLanguageLabel}`}
          >
            <CoachAvatar language={coachLanguageValue} size={LIST_AVATAR_SIZE} hideBadge />
            <View style={styles.rowBody}>
              <View style={styles.rowTop}>
                <Text style={styles.rowName} numberOfLines={1}>
                  Lumi
                </Text>
                <View style={styles.aiTag}>
                  <Text style={styles.aiTagText}>AI</Text>
                </View>
              </View>
              <Text style={styles.rowPreview} numberOfLines={1}>
                Practice {coachLanguageLabel}, switch modes, get quick corrections.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={warm.mutedInk} />
          </Pressable>
        </View>
      ) : null}

      {visibleConversations.length > 0 && !isSearching ? (
        <Text style={styles.sectionLabel} accessibilityRole="header">
          Chats
        </Text>
      ) : null}
    </View>
  );

  const listEmpty = showSkeleton ? (
    <View accessibilityLabel="Loading chats" accessible>
      {[0, 1, 2, 3, 4].map((index) => (
        <View key={`skeleton-${index}`} style={styles.skeletonRow}>
          <View style={styles.skeletonAvatar} />
          <View style={styles.skeletonBody}>
            <View style={[styles.skeletonLine, { width: "45%" }]} />
            <View style={[styles.skeletonLine, { width: "75%" }]} />
          </View>
        </View>
      ))}
    </View>
  ) : isSearching ? (
    canStartChat ? null : (
      <Text style={styles.emptySearch}>No chats match “{trimmedQuery}”.</Text>
    )
  ) : (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="chatbubbles-outline" size={32} color={warm.peachInk} />
      </View>
      <Text style={styles.emptyTitle}>No chats yet</Text>
      <Text style={styles.emptyText}>
        Say hello to someone who speaks the language you’re learning. Your conversations will show up here.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}
        onPress={onFindPeople}
        accessibilityRole="button"
      >
        <Text style={styles.emptyButtonText}>Find people</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          Chats
        </Text>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={warm.mutedInk} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={onSearchQueryChange}
            placeholder="Search chats or a username"
            placeholderTextColor={warm.mutedInk}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (canStartChat && visibleConversations.length === 0) onStartConversation();
            }}
            accessibilityLabel="Search chats, or type a username to start a chat"
          />
          {searchQuery ? (
            <Pressable
              style={styles.searchClear}
              onPress={() => onSearchQueryChange("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={warm.mutedInk} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <FlatList
        data={visibleConversations}
        keyExtractor={conversationKeyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty ?? undefined}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={11}
        removeClippedSubviews={Platform.OS === "android"}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={handleRefresh}
            tintColor={warm.teal}
            colors={[warm.teal]}
          />
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

type ConversationRowProps = {
  conversation: Conversation;
  otherUsername: string;
  otherImagePath: string | null;
  isOnline: boolean;
  isTyping: boolean;
  currentUserId?: number;
  styles: ListStyles;
  warm: WarmColors;
  onPress: (conversationId: number) => void;
};

const ConversationRow = React.memo(function ConversationRow({
  conversation,
  otherUsername,
  otherImagePath,
  isOnline,
  isTyping,
  currentUserId,
  styles,
  warm,
  onPress,
}: ConversationRowProps) {
  const unreadCount = conversation.unread_count || 0;
  const preview = conversationPreview(conversation, currentUserId, isTyping);
  const timeLabel = formatListTime(conversation.last_message?.timestamp || conversation.updated_at);
  const a11yLabel = [
    otherUsername,
    isOnline ? "online" : "",
    unreadCount > 0 ? `${unreadCount} unread` : "",
    preview.ticksLabel ? `You: ${preview.text}, ${preview.ticksLabel}` : preview.text,
    timeLabel,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPress(conversation.id)}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      <ChatAvatar name={otherUsername} imagePath={otherImagePath} size={LIST_AVATAR_SIZE} online={isOnline} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>
            {otherUsername}
          </Text>
          {timeLabel ? (
            <Text style={[styles.rowTime, unreadCount > 0 && styles.rowTimeUnread]}>{timeLabel}</Text>
          ) : null}
        </View>
        <View style={styles.rowBottom}>
          {preview.ticks ? (
            <Text style={[styles.ticks, preview.ticksRead && styles.ticksRead]}>{preview.ticks}</Text>
          ) : null}
          <Text
            style={[
              styles.rowPreview,
              styles.rowPreviewFlex,
              unreadCount > 0 && styles.rowPreviewUnread,
              preview.typing && styles.rowPreviewTyping,
            ]}
            numberOfLines={1}
          >
            {preview.text}
          </Text>
          {unreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadBadgeText(unreadCount)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: warm.cream,
    },
    head: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 6,
      gap: 12,
    },
    title: {
      color: warm.ink,
      fontSize: 28,
      fontFamily: fontFamilies.displayBold,
      letterSpacing: -0.5,
    },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 46,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.paper,
      paddingLeft: 16,
      paddingRight: 4,
    },
    searchInput: {
      flex: 1,
      color: warm.ink,
      fontSize: 15,
      paddingVertical: 10,
      fontFamily: fontFamilies.bodyMedium,
    },
    searchClear: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    listContent: {
      paddingHorizontal: 12,
      paddingBottom: 24,
      flexGrow: 1,
    },
    sectionLabel: {
      color: warm.teal,
      fontSize: 12,
      fontFamily: fontFamilies.bodyExtraBold,
      letterSpacing: 1,
      textTransform: "uppercase",
      marginTop: 12,
      marginBottom: 6,
      marginHorizontal: 6,
    },
    companion: {
      paddingBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: warm.line,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 72,
      borderRadius: 22,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    rowPressed: {
      backgroundColor: warm.creamDeep,
    },
    pressed: {
      opacity: 0.85,
    },
    coachRow: {
      backgroundColor: warm.sage,
    },
    startRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 64,
      borderRadius: 22,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginTop: 8,
      backgroundColor: warm.peachSoft,
      borderWidth: 1,
      borderColor: warm.lineWarm,
    },
    startIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.navy,
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
    },
    rowTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    rowName: {
      flexShrink: 1,
      color: warm.ink,
      fontSize: 16,
      fontFamily: fontFamilies.bodyBold,
    },
    rowTime: {
      marginLeft: "auto",
      color: warm.mutedInk,
      fontSize: 12,
      fontFamily: fontFamilies.bodyMedium,
    },
    rowTimeUnread: {
      color: warm.teal,
      fontFamily: fontFamilies.bodyBold,
    },
    rowBottom: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 3,
    },
    rowPreview: {
      color: warm.mutedInk,
      fontSize: 14,
      fontFamily: fontFamilies.bodyRegular,
      marginTop: 2,
    },
    rowPreviewFlex: {
      flex: 1,
      marginTop: 0,
    },
    rowPreviewUnread: {
      color: warm.ink,
      fontFamily: fontFamilies.bodyBold,
    },
    rowPreviewTyping: {
      color: warm.teal,
      fontFamily: fontFamilies.bodyBold,
    },
    ticks: {
      color: warm.mutedInk,
      fontSize: 13,
      fontFamily: fontFamilies.bodyExtraBold,
    },
    ticksRead: {
      color: warm.teal,
    },
    badge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 7,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.badge,
    },
    badgeText: {
      color: warm.onBadge,
      fontSize: 12,
      fontFamily: fontFamilies.bodyExtraBold,
    },
    aiTag: {
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 1,
      backgroundColor: warm.paper,
    },
    aiTagText: {
      color: warm.teal,
      fontSize: 12,
      fontFamily: fontFamilies.bodyExtraBold,
    },
    // Same box as a conversation row (minHeight 72) so the list doesn't jump when data arrives.
    skeletonRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 72,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    skeletonAvatar: {
      width: LIST_AVATAR_SIZE,
      height: LIST_AVATAR_SIZE,
      borderRadius: LIST_AVATAR_SIZE / 2,
      backgroundColor: warm.skeleton,
    },
    skeletonBody: {
      flex: 1,
      gap: 8,
    },
    skeletonLine: {
      height: 12,
      borderRadius: 6,
      backgroundColor: warm.skeleton,
    },
    empty: {
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 40,
      gap: 10,
    },
    emptyIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.peachSoft,
    },
    emptyTitle: {
      color: warm.ink,
      fontSize: 20,
      fontFamily: fontFamilies.displayBold,
    },
    emptyText: {
      color: warm.mutedInk,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      fontFamily: fontFamilies.bodyRegular,
    },
    emptyButton: {
      marginTop: 6,
      minHeight: 44,
      borderRadius: 999,
      paddingHorizontal: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.navy,
    },
    emptyButtonText: {
      color: warm.onNavy,
      fontSize: 15,
      fontFamily: fontFamilies.bodyBold,
    },
    emptySearch: {
      color: warm.mutedInk,
      fontSize: 14,
      textAlign: "center",
      paddingVertical: 24,
      fontFamily: fontFamilies.bodyMedium,
    },
  });

type ListStyles = ReturnType<typeof createStyles>;
