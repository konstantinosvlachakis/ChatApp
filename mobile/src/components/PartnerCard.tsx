import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

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
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Image
        source={{ uri: profileImage || "https://placehold.co/200x200" }}
        style={styles.avatar}
      />
      <View style={styles.content}>
        <Text numberOfLines={1} style={styles.name}>
          {username}
        </Text>
        <Text numberOfLines={2} style={styles.bio}>
          {bio || "Registered user"}
        </Text>
        <View style={styles.tags}>
          <Text style={styles.tag}>Fluent: {nativeLanguage || "Unknown"}</Text>
          {learningLanguage ? <Text style={styles.tag}>Learns: {learningLanguage}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    flexDirection: "row",
    gap: 12,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: "#ddd",
  },
  content: {
    flex: 1,
    gap: 6,
  },
  name: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 20,
  },
  bio: {
    color: colors.mutedText,
    fontSize: 14,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    fontSize: 12,
    color: colors.text,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
});
