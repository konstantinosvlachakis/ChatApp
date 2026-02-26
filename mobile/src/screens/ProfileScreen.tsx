import React, { useEffect, useState } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { fetchProfile } from "../services/api/auth";
import type { Profile } from "../types";
import { colors } from "../theme/colors";

export function ProfileScreen() {
  const { user: authUser } = useAuth();
  const [user, setUser] = useState<Profile | null>(authUser);
  const [loading, setLoading] = useState(false);

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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{user?.username || "Profile"}</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Native language</Text>
          <Text style={styles.value}>{user?.native_language || "-"}</Text>
          <Text style={styles.label}>Practicing</Text>
          <Text style={styles.value}>{(user?.languages_practicing || []).join(", ") || "-"}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16 },
  title: { fontSize: 28, fontWeight: "800", color: colors.text, marginBottom: 10 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  label: { color: colors.mutedText, fontSize: 13 },
  value: { color: colors.text, fontSize: 16, fontWeight: "600" },
});
