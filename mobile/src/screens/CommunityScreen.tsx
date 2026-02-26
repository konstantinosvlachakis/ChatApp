import React, { useEffect, useState } from "react";
import { FlatList, RefreshControl, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { fetchPeople } from "../services/api/auth";
import { PartnerCard } from "../components/PartnerCard";
import type { ProfileListResponse } from "../types";
import { colors } from "../theme/colors";

export function CommunityScreen() {
  const [data, setData] = useState<ProfileListResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetchPeople(1, 24);
      setData(response);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Community</Text>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={data?.profiles || []}
        keyExtractor={(item) => item.username}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        renderItem={({ item }) => (
          <PartnerCard
            username={item.username}
            nativeLanguage={item.native_language}
            learningLanguage={item.languages_practicing?.[0]}
            profileImage={item.profile_image_url || undefined}
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>No people found.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  listContent: {
    padding: 12,
    gap: 10,
  },
  empty: {
    color: colors.mutedText,
    textAlign: "center",
    marginTop: 32,
  },
});
