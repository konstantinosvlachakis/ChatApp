import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { API_BASE_URL } from "../config/api";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";

type Props = {
  username: string;
  bio?: string;
  nativeLanguage?: string;
  learningLanguage?: string;
  profileImage?: string | null;
  onPress?: () => void;
};

export function PartnerCard({
  username,
  bio,
  nativeLanguage,
  learningLanguage,
  profileImage,
  onPress,
}: Props) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const resolveMediaUrl = (path?: string | null) => {
    if (!path) return "https://placehold.co/200x200";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (path.startsWith("/media/")) return `${API_BASE_URL}${path}`;
    if (path.startsWith("media/")) return `${API_BASE_URL}/${path}`;
    return `${API_BASE_URL}/media/${path}`;
  };

  const imageUrl = resolveMediaUrl(profileImage);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Image source={{ uri: imageUrl }} style={styles.avatar} />
      <View style={styles.content}>
        <Text numberOfLines={1} style={styles.name}>
          {username}
        </Text>
        <Text numberOfLines={2} style={styles.bio}>
          {bio || "Registered user"}
        </Text>
        <View style={styles.languageRow}>
          <Text style={styles.languageLabel}>Fluent</Text>
          <Text style={styles.languageChip}>{nativeLanguage || "Unknown"}</Text>
        </View>
        <View style={styles.languageRow}>
          <Text style={styles.languageLabel}>Learning</Text>
          <Text style={[styles.languageChip, styles.learnTag]}>{learningLanguage || "-"}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    avatar: {
      width: 78,
      height: 78,
      borderRadius: 100,
      backgroundColor: colors.surfaceMuted,
    },
    content: {
      flex: 1,
      marginLeft: 12,
    },
    name: {
      color: colors.text,
      fontWeight: "800",
      fontSize: 19,
      marginBottom: 2,
    },
    bio: {
      color: colors.mutedText,
      fontSize: 13,
      marginBottom: 10,
    },
    languageRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 6,
    },
    languageLabel: {
      width: 64,
      fontSize: 12,
      fontWeight: "700",
      color: colors.mutedText,
    },
    languageChip: {
      fontSize: 12,
      color: colors.chipText,
      backgroundColor: colors.chipBackground,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    learnTag: {
      backgroundColor: colors.surfaceMuted,
      color: colors.primary,
    },
  });
