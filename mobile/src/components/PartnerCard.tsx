import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { API_BASE_URL } from "../config/api";

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

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 14,
    backgroundColor: "#ddd",
  },
  content: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 19,
    marginBottom: 2,
  },
  bio: {
    color: "#64748b",
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
    color: "#6b7280",
  },
  languageChip: {
    fontSize: 12,
    color: "#1f2937",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  learnTag: {
    backgroundColor: "#e2f2ff",
    color: "#075985",
  },
});
