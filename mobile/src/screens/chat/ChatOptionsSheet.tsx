import React, { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";
import { BottomSheet } from "./BottomSheet";

export type ChatOptionsState = {
  username: string;
  isBlocked: boolean;
} | null;

type ChatOptionsSheetProps = {
  warm: WarmColors;
  menu: ChatOptionsState;
  loading: boolean;
  reduceMotion: boolean;
  onClose: () => void;
  onViewProfile: (username: string) => void;
  onReport: (username: string) => void;
  onToggleBlock: () => void;
};

/** Header overflow menu: view profile, report, block/unblock. */
export function ChatOptionsSheet({
  warm,
  menu,
  loading,
  reduceMotion,
  onClose,
  onViewProfile,
  onReport,
  onToggleBlock,
}: ChatOptionsSheetProps) {
  const styles = useMemo(() => createStyles(warm), [warm]);
  return (
    <BottomSheet warm={warm} visible={Boolean(menu)} reduceMotion={reduceMotion} onClose={onClose}>
      {menu ? (
        <>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
              {menu.username}
            </Text>
            <Text style={styles.subtitle}>Conversation options</Text>
          </View>

          <Pressable
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            onPress={() => onViewProfile(menu.username)}
            accessibilityRole="button"
          >
            <View style={styles.itemIcon}>
              <Ionicons name="person-circle-outline" size={20} color={warm.teal} />
            </View>
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>View profile</Text>
              <Text style={styles.itemSubtitle}>See photos, languages, and profile details</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            onPress={() => onReport(menu.username)}
            accessibilityRole="button"
          >
            <View style={[styles.itemIcon, styles.itemIconDanger]}>
              <Ionicons name="flag-outline" size={20} color={warm.danger} />
            </View>
            <View style={styles.itemBody}>
              <Text style={[styles.itemTitle, styles.itemTitleDanger]}>Report user</Text>
              <Text style={styles.itemSubtitle}>Let us know if something feels unsafe</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            onPress={onToggleBlock}
            disabled={loading}
            accessibilityRole="button"
            accessibilityState={{ busy: loading, disabled: loading }}
          >
            <View style={[styles.itemIcon, !menu.isBlocked && styles.itemIconDanger]}>
              {loading ? (
                <ActivityIndicator size="small" color={warm.teal} />
              ) : (
                <Ionicons
                  name={menu.isBlocked ? "checkmark-circle-outline" : "ban-outline"}
                  size={20}
                  color={menu.isBlocked ? warm.teal : warm.danger}
                />
              )}
            </View>
            <View style={styles.itemBody}>
              <Text style={[styles.itemTitle, !menu.isBlocked && styles.itemTitleDanger]}>
                {menu.isBlocked ? "Unblock user" : "Block user"}
              </Text>
              <Text style={styles.itemSubtitle}>
                {menu.isBlocked ? "Allow this user to contact you again" : "Prevent this user from messaging you"}
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Close</Text>
          </Pressable>
        </>
      ) : null}
    </BottomSheet>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    header: {
      paddingHorizontal: 4,
      marginBottom: 8,
    },
    title: {
      color: warm.ink,
      fontSize: 20,
      fontFamily: fontFamilies.displayBold,
    },
    subtitle: {
      color: warm.mutedInk,
      fontSize: 13,
      marginTop: 2,
      fontFamily: fontFamilies.bodyMedium,
    },
    item: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 60,
      borderRadius: 18,
      paddingHorizontal: 6,
      paddingVertical: 8,
    },
    pressed: {
      opacity: 0.75,
    },
    itemIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.sage,
    },
    itemIconDanger: {
      backgroundColor: warm.dangerSoft,
    },
    itemBody: {
      flex: 1,
    },
    itemTitle: {
      color: warm.ink,
      fontSize: 16,
      fontFamily: fontFamilies.bodyBold,
    },
    itemTitleDanger: {
      color: warm.danger,
    },
    itemSubtitle: {
      color: warm.mutedInk,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 2,
      fontFamily: fontFamilies.bodyMedium,
    },
    cancel: {
      marginTop: 8,
      minHeight: 48,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      backgroundColor: warm.secondary,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelText: {
      color: warm.ink,
      fontSize: 15,
      fontFamily: fontFamilies.bodyBold,
    },
  });
