import React, { useMemo, type RefObject } from "react";
import type { TextInputInstance } from "react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChatAvatar } from "../../components/chat/ChatAvatar";
import { presenceLabel } from "../../components/chat/conversationList";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";
import type { ConversationParticipant } from "../../types";

export const CHAT_HEADER_AVATAR_SIZE = 40;

type ChatHeaderProps = {
  warm: WarmColors;
  otherUser: ConversationParticipant;
  isOnline: boolean;
  isTyping: boolean;
  optionsLoading: boolean;
  onBack: () => void;
  onOpenProfile: () => void;
  onOpenOptions: () => void;
  // In-chat search
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
};

/** Chat room header: back, avatar + presence (opens the profile), search toggle and options. */
export function ChatHeader({
  warm,
  otherUser,
  isOnline,
  isTyping,
  optionsLoading,
  onBack,
  onOpenProfile,
  onOpenOptions,
  searchOpen,
  searchInputRef,
  searchQuery,
  searchResultLabel,
  searchHasResults,
  onToggleSearch,
  onSearchQueryChange,
  onSearchSubmit,
  onSearchPrevious,
  onSearchNext,
  onCloseSearch,
}: ChatHeaderProps) {
  const styles = useMemo(() => createStyles(warm), [warm]);
  const status = presenceLabel(isTyping, isOnline);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          onPress={(event) => {
            event.stopPropagation();
            onBack();
          }}
          accessibilityRole="button"
          accessibilityLabel="Back to chats"
        >
          <Ionicons name="chevron-back" size={24} color={warm.ink} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.identity, pressed && styles.pressed]}
          onPress={(event) => {
            event.stopPropagation();
            onOpenProfile();
          }}
          accessibilityRole="button"
          accessibilityLabel={`View ${otherUser.username}'s profile${status ? `, ${status}` : ""}`}
        >
          <ChatAvatar
            name={otherUser.username}
            imagePath={otherUser.profile_image_url}
            size={CHAT_HEADER_AVATAR_SIZE}
            online={isOnline}
          />
          <View style={styles.identityText}>
            <Text style={styles.name} numberOfLines={1}>
              {otherUser.username}
            </Text>
            {status ? (
              <Text style={[styles.status, (isTyping || isOnline) && styles.statusActive]} numberOfLines={1}>
                {status}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.iconButton, searchOpen && styles.iconButtonActive, pressed && styles.pressed]}
          onPress={(event) => {
            event.stopPropagation();
            onToggleSearch();
          }}
          accessibilityRole="button"
          accessibilityLabel={searchOpen ? "Close search" : "Search in conversation"}
          accessibilityState={{ expanded: searchOpen }}
        >
          <Ionicons name="search" size={20} color={warm.ink} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          onPress={(event) => {
            event.stopPropagation();
            onOpenOptions();
          }}
          disabled={optionsLoading}
          accessibilityRole="button"
          accessibilityLabel="Conversation options"
          accessibilityState={{ busy: optionsLoading }}
        >
          {optionsLoading ? (
            <ActivityIndicator size="small" color={warm.teal} />
          ) : (
            <Ionicons name="ellipsis-horizontal" size={22} color={warm.ink} />
          )}
        </Pressable>
      </View>

      {searchOpen ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={warm.mutedInk} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={onSearchQueryChange}
            placeholder="Search messages"
            placeholderTextColor={warm.mutedInk}
            returnKeyType="search"
            onSubmitEditing={onSearchSubmit}
            accessibilityLabel="Search messages in this conversation"
          />
          <Text style={styles.searchCount} accessibilityLiveRegion="polite">
            {searchResultLabel}
          </Text>
          <Pressable
            style={styles.searchAction}
            onPress={onSearchPrevious}
            disabled={!searchHasResults}
            accessibilityRole="button"
            accessibilityLabel="Previous result"
            accessibilityState={{ disabled: !searchHasResults }}
          >
            <Ionicons name="chevron-up" size={20} color={searchHasResults ? warm.ink : warm.mutedInk} />
          </Pressable>
          <Pressable
            style={styles.searchAction}
            onPress={onSearchNext}
            disabled={!searchHasResults}
            accessibilityRole="button"
            accessibilityLabel="Next result"
            accessibilityState={{ disabled: !searchHasResults }}
          >
            <Ionicons name="chevron-down" size={20} color={searchHasResults ? warm.ink : warm.mutedInk} />
          </Pressable>
          <Pressable
            style={styles.searchAction}
            onPress={onCloseSearch}
            accessibilityRole="button"
            accessibilityLabel="Close search"
          >
            <Ionicons name="close" size={20} color={warm.ink} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: warm.paper,
      borderBottomWidth: 1,
      borderBottomColor: warm.line,
      paddingHorizontal: 6,
      paddingVertical: 6,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    iconButtonActive: {
      backgroundColor: warm.creamDeep,
    },
    pressed: {
      opacity: 0.7,
    },
    identity: {
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingRight: 6,
      borderRadius: 22,
    },
    identityText: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      color: warm.ink,
      fontSize: 17,
      fontFamily: fontFamilies.displayBold,
    },
    status: {
      color: warm.mutedInk,
      fontSize: 13,
      marginTop: 1,
      fontFamily: fontFamilies.bodyMedium,
    },
    statusActive: {
      color: warm.teal,
      fontFamily: fontFamilies.bodyBold,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      marginTop: 6,
      marginHorizontal: 6,
      marginBottom: 2,
      minHeight: 44,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.cream,
      paddingLeft: 14,
      paddingRight: 2,
    },
    searchInput: {
      flex: 1,
      color: warm.ink,
      fontSize: 15,
      paddingVertical: 8,
      paddingHorizontal: 6,
      fontFamily: fontFamilies.bodyMedium,
    },
    searchCount: {
      color: warm.mutedInk,
      fontSize: 12,
      minWidth: 36,
      textAlign: "center",
      fontFamily: fontFamilies.bodyBold,
    },
    searchAction: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
  });
