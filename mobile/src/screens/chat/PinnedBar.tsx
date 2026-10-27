import React, { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { messagePreviewText } from "../../components/chat/attachments";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";
import type { ChatMessage } from "../../types";

type PinnedBarProps = {
  warm: WarmColors;
  /** Newest pin first. */
  pinnedMessages: ChatMessage[];
  showList: boolean;
  reduceMotion: boolean;
  onOpenList: () => void;
  onCloseList: () => void;
  onJump: (message: ChatMessage) => void;
  onUnpin: (message: ChatMessage) => void;
};

/** Latest pinned message as a pill under the header, plus the "all pinned" bottom sheet. */
export function PinnedBar({
  warm,
  pinnedMessages,
  showList,
  reduceMotion,
  onOpenList,
  onCloseList,
  onJump,
  onUnpin,
}: PinnedBarProps) {
  const styles = useMemo(() => createStyles(warm), [warm]);
  const insets = useSafeAreaInsets();
  const latest = pinnedMessages[0] || null;
  const additionalCount = Math.max(0, pinnedMessages.length - 1);

  return (
    <>
      {latest ? (
        <View style={styles.barWrap}>
          <Pressable
            style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
            onPress={() => onJump(latest)}
            accessibilityRole="button"
            accessibilityLabel={`Pinned message: ${messagePreviewText(latest) || "Pinned message"}. Jump to it`}
          >
            <Ionicons name="pin" size={16} color={warm.peachInk} />
            <Text numberOfLines={1} style={styles.barText}>
              {messagePreviewText(latest) || "Pinned message"}
            </Text>
            {additionalCount > 0 ? (
              <Pressable
                style={styles.countPill}
                onPress={(event) => {
                  event.stopPropagation();
                  onOpenList();
                }}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Show all ${pinnedMessages.length} pinned messages`}
              >
                <Text style={styles.countPillText}>+{additionalCount}</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.closeButton}
              onPress={(event) => {
                event.stopPropagation();
                onUnpin(latest);
              }}
              accessibilityRole="button"
              accessibilityLabel="Unpin message"
            >
              <Ionicons name="close" size={18} color={warm.mutedInk} />
            </Pressable>
          </Pressable>
        </View>
      ) : null}

      <Modal
        transparent
        visible={showList}
        animationType={reduceMotion ? "none" : "slide"}
        onRequestClose={onCloseList}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onCloseList} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle} accessibilityRole="header">
              Pinned messages
            </Text>
            <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
              {pinnedMessages.map((message) => (
                <Pressable
                  key={`mobile-pinned-${message.id}`}
                  style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                  onPress={() => onJump(message)}
                  accessibilityRole="button"
                  accessibilityLabel={`${messagePreviewText(message) || "Pinned message"}. Jump to it`}
                >
                  <Ionicons name="pin" size={16} color={warm.peachInk} />
                  <Text numberOfLines={2} style={styles.itemText}>
                    {messagePreviewText(message) || "Pinned message"}
                  </Text>
                  <Pressable
                    style={styles.closeButton}
                    onPress={(event) => {
                      event.stopPropagation();
                      onUnpin(message);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Unpin message"
                  >
                    <Ionicons name="close" size={18} color={warm.mutedInk} />
                  </Pressable>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    barWrap: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 2,
      backgroundColor: warm.paper,
    },
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 44,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      backgroundColor: warm.peachSoft,
      paddingLeft: 14,
      paddingRight: 2,
    },
    barText: {
      flex: 1,
      color: warm.ink,
      fontSize: 14,
      fontFamily: fontFamilies.bodySemiBold,
    },
    countPill: {
      minHeight: 30,
      borderRadius: 999,
      backgroundColor: warm.paper,
      paddingHorizontal: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    countPillText: {
      color: warm.inkSoft,
      fontSize: 12,
      fontFamily: fontFamilies.bodyExtraBold,
    },
    closeButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    pressed: {
      opacity: 0.8,
    },
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: warm.scrim,
    },
    sheet: {
      maxHeight: "70%",
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: warm.paper,
      paddingHorizontal: 16,
      paddingTop: 10,
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 5,
      borderRadius: 999,
      backgroundColor: warm.line,
      marginBottom: 12,
    },
    sheetTitle: {
      color: warm.ink,
      fontSize: 18,
      fontFamily: fontFamilies.displayBold,
      marginBottom: 10,
      paddingHorizontal: 4,
    },
    sheetList: {
      flexGrow: 0,
    },
    sheetListContent: {
      gap: 8,
    },
    item: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 52,
      borderRadius: 18,
      backgroundColor: warm.peachSoft,
      paddingLeft: 14,
      paddingRight: 2,
      paddingVertical: 4,
    },
    itemText: {
      flex: 1,
      color: warm.ink,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fontFamilies.bodyMedium,
    },
  });
