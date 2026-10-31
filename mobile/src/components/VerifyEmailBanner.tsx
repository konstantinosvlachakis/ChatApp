import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { isEmailUnverified } from "../features/emailVerification";
import { dismissVerifyBanner, useVerifyBannerDismissed } from "../services/emailVerification";
import { warmColors, type WarmColors } from "../theme/warm";

/**
 * "Verify your email to start chatting" strip shown in flow (not an overlay) at the top of the
 * People and Chats lists while `user.email_verified === false`. Dismissed for this app session
 * only; it comes back on the next start.
 */
export function VerifyEmailBanner() {
  const { user } = useAuth();
  const dismissed = useVerifyBannerDismissed();
  const navigation = useNavigation<any>();
  const { isDark } = useTheme();
  const warm = warmColors(isDark);
  const styles = useMemo(() => createStyles(warm), [warm]);

  if (dismissed || !isEmailUnverified(user)) return null;

  return (
    <View style={styles.banner}>
      <Pressable
        style={styles.main}
        onPress={() => navigation.navigate("VerifyEmail")}
        accessibilityRole="button"
        accessibilityLabel="Verify your email to start chatting"
        accessibilityHint="Opens the screen to enter your 6-digit code"
      >
        <Ionicons name="mail-unread-outline" size={20} color={warm.peachInk} />
        <View style={styles.texts}>
          <Text style={styles.title}>Verify your email to start chatting</Text>
          <Text style={styles.text} numberOfLines={1}>
            Enter the code we sent to {user?.email || "your email"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={warm.inkSoft} />
      </Pressable>
      <Pressable
        style={styles.close}
        onPress={dismissVerifyBanner}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Dismiss for now"
      >
        <Ionicons name="close" size={18} color={warm.inkSoft} />
      </Pressable>
    </View>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: 16,
      marginTop: 8,
      marginBottom: 4,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      backgroundColor: warm.peachSoft,
    },
    main: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      paddingLeft: 12,
    },
    texts: {
      flex: 1,
    },
    title: {
      color: warm.ink,
      fontSize: 14,
      fontWeight: "700",
    },
    text: {
      color: warm.inkSoft,
      fontSize: 12,
      marginTop: 1,
    },
    close: {
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
  });
