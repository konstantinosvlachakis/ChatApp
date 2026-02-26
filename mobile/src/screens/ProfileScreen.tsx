import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { fetchProfile } from "../services/api/auth";
import type { Profile } from "../types";
import { colors } from "../theme/colors";
import { API_BASE_URL } from "../config/api";

export function ProfileScreen() {
  const { user: authUser, logout } = useAuth();
  const [user, setUser] = useState<Profile | null>(authUser);
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const profile = await fetchProfile();
        if (mounted) setUser(profile);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const resolveMediaUrl = (path?: string) => {
    if (!path) return `${API_BASE_URL}/media/profile_images/MainAfter.jpg`;
    if (path.startsWith("http")) return path;
    if (path.startsWith("/media/")) return `${API_BASE_URL}${path}`;
    return `${API_BASE_URL}/media/${path}`;
  };

  const profileImage = resolveMediaUrl(user?.profile_image_url);
  const complementaryOne = resolveMediaUrl((user as any)?.complementary_image_1_url);
  const complementaryTwo = resolveMediaUrl((user as any)?.complementary_image_2_url);
  const practicingLanguages = user?.languages_practicing || [];

  const onLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          try {
            setLoggingOut(true);
            await logout();
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Text style={styles.pageTitle}>Profile</Text>
          <Pressable style={styles.logoutButton} onPress={onLogout} disabled={loggingOut}>
            <Text style={styles.logoutButtonText}>{loggingOut ? "Logging out..." : "Log out"}</Text>
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <Image source={{ uri: profileImage }} style={styles.avatar} />
          <Text style={styles.heroTitle}>
            {user?.username || "Profile"}
            {typeof user?.age === "number" ? `, ${user.age}` : ""}
          </Text>
          <Pressable
            style={styles.editButton}
            onPress={() => Alert.alert("Coming soon", "Edit profile on mobile will be added next.")}
          >
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </Pressable>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>👤 Personal Information</Text>
          <Text style={styles.rowText}>
            <Text style={styles.rowLabel}>Name:</Text> {user?.username || "N/A"}
          </Text>
          <Text style={styles.rowText}>
            <Text style={styles.rowLabel}>Age:</Text>{" "}
            {typeof user?.age === "number" ? user.age : "Not provided"}
          </Text>
          <Text style={styles.rowText}>
            <Text style={styles.rowLabel}>Bio:</Text> Passionate about learning new languages and
            connecting with people from different cultures.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>🌐 Languages</Text>
          <Text style={styles.rowText}>
            <Text style={styles.rowLabel}>Native Language:</Text>{" "}
            {user?.native_language || "N/A"}
          </Text>
          <Text style={[styles.rowText, styles.rowLabel]}>Languages Practicing:</Text>
          <View style={styles.chipsWrap}>
            {(practicingLanguages.length ? practicingLanguages : ["English", "Spanish", "French"]).map(
              (lang) => (
                <View key={lang} style={styles.chip}>
                  <Text style={styles.chipText}>{lang}</Text>
                </View>
              )
            )}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>🎯 Learning Goals</Text>
          <Text style={styles.rowText}>
            My goal is to become fluent and confident in new languages for both travel and
            communication.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>📸 Photos</Text>
          <View style={styles.photosRow}>
            <Image source={{ uri: profileImage }} style={styles.photo} />
            <Image source={{ uri: complementaryOne }} style={styles.photo} />
            <Image source={{ uri: complementaryTwo }} style={styles.photo} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 12 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  pageTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 28,
  },
  logoutButton: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  logoutButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    alignItems: "center",
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: "#93c5fd",
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 12,
    textTransform: "capitalize",
  },
  editButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  editButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 6,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  rowText: {
    color: "#374151",
    fontSize: 16,
    lineHeight: 24,
  },
  rowLabel: {
    color: colors.text,
    fontWeight: "700",
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  chip: {
    backgroundColor: "#f3f4f6",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    color: "#374151",
    fontSize: 14,
    fontWeight: "600",
  },
  photosRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  photo: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: "#e5e7eb",
  },
});
