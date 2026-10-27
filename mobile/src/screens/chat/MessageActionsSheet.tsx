import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { messagePreviewText } from "../../components/chat/attachments";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";
import type { ChatMessage } from "../../types";
import { BottomSheet } from "./BottomSheet";

export type MessageMenuAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

export type MessageMenuState = {
  message: ChatMessage;
  isMine: boolean;
} | null;

type MessageActionsSheetProps = {
  warm: WarmColors;
  menu: MessageMenuState;
  actions: MessageMenuAction[];
  reduceMotion: boolean;
  onClose: () => void;
};

/** Long-press menu of a message as a bottom sheet (preview + actions). */
export function MessageActionsSheet({ warm, menu, actions, reduceMotion, onClose }: MessageActionsSheetProps) {
  const styles = useMemo(() => createStyles(warm), [warm]);
  return (
    <BottomSheet warm={warm} visible={Boolean(menu)} reduceMotion={reduceMotion} onClose={onClose}>
      {menu ? (
        <>
          <View style={[styles.preview, menu.isMine ? styles.previewMine : styles.previewOther]}>
            <Text style={styles.previewLabel}>
              {menu.isMine ? "Your message" : menu.message.sender?.username || "Message"}
            </Text>
            <Text numberOfLines={3} style={styles.previewText}>
              {messagePreviewText(menu.message) || "Message"}
            </Text>
          </View>
          {actions.map((action) => (
            <Pressable
              key={`${menu.message.id}-${action.key}`}
              style={({ pressed }) => [styles.item, action.destructive && styles.itemDanger, pressed && styles.pressed]}
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <View style={[styles.itemIcon, action.destructive && styles.itemIconDanger]}>
                <Ionicons name={action.icon} size={18} color={action.destructive ? warm.danger : warm.ink} />
              </View>
              <Text style={[styles.itemText, action.destructive && styles.itemTextDanger]}>{action.label}</Text>
            </Pressable>
          ))}
        </>
      ) : null}
    </BottomSheet>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    preview: {
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 8,
    },
    previewMine: {
      backgroundColor: warm.bubbleOut,
    },
    previewOther: {
      backgroundColor: warm.bubbleIn,
    },
    previewLabel: {
      color: warm.teal,
      fontSize: 12,
      fontFamily: fontFamilies.bodyExtraBold,
      marginBottom: 2,
    },
    previewText: {
      color: warm.ink,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fontFamilies.bodyMedium,
    },
    item: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 16,
      paddingHorizontal: 8,
    },
    itemDanger: {
      backgroundColor: warm.dangerSoft,
      marginTop: 4,
    },
    pressed: {
      opacity: 0.75,
    },
    itemIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.cream,
    },
    itemIconDanger: {
      backgroundColor: warm.paper,
    },
    itemText: {
      flex: 1,
      color: warm.ink,
      fontSize: 16,
      fontFamily: fontFamilies.bodySemiBold,
    },
    itemTextDanger: {
      color: warm.danger,
    },
  });
