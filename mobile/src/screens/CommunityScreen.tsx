import React, { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMemo } from "react";
import { fetchPeople } from "../services/api/auth";
import { PartnerCard } from "../components/PartnerCard";
import type { ProfileListResponse } from "../types";
import { colors } from "../theme/colors";

export function CommunityScreen() {
  const [data, setData] = useState<ProfileListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("All");

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

  const people = data?.profiles || [];

  const languageOptions = useMemo(() => {
    const allLanguages = new Set<string>();
    for (const profile of people) {
      if (profile.native_language) {
        allLanguages.add(profile.native_language);
      }
      for (const lang of profile.languages_practicing || []) {
        allLanguages.add(lang);
      }
    }
    return ["All", ...Array.from(allLanguages).sort((a, b) => a.localeCompare(b))];
  }, [people]);

  const filteredPeople = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    return people.filter((person) => {
      const matchesSearch =
        !normalizedSearch ||
        person.username.toLowerCase().includes(normalizedSearch) ||
        (person.native_language || "").toLowerCase().includes(normalizedSearch) ||
        (person.languages_practicing || []).some((lang) =>
          lang.toLowerCase().includes(normalizedSearch)
        );

      const matchesLanguage =
        selectedLanguage === "All" ||
        person.native_language === selectedLanguage ||
        (person.languages_practicing || []).includes(selectedLanguage);

      return matchesSearch && matchesLanguage;
    });
  }, [people, searchText, selectedLanguage]);

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={filteredPeople}
        keyExtractor={(item) => item.username}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <Text style={styles.title}>Discover Language Partners</Text>
            <Text style={styles.subtitle}>Find members by language and start chatting.</Text>
            <TextInput
              style={styles.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search by username or language..."
              placeholderTextColor="#9ca3af"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {languageOptions.map((language) => {
                const active = language === selectedLanguage;
                return (
                  <Pressable
                    key={language}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setSelectedLanguage(language)}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {language}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
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
    backgroundColor: "#f8fafc",
  },
  headerWrap: {
    marginBottom: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
  },
  subtitle: {
    color: "#475569",
    marginBottom: 12,
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 10,
  },
  searchInput: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderColor: "#cbd5e1",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0f172a",
    marginBottom: 10,
  },
  filterRow: {
    gap: 8,
    paddingBottom: 4,
  },
  filterChip: {
    backgroundColor: "#eef2f7",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: "#334155",
    borderColor: "#334155",
  },
  filterChipText: {
    color: "#334155",
    fontWeight: "600",
    fontSize: 13,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  empty: {
    color: colors.mutedText,
    textAlign: "center",
    marginTop: 32,
  },
});
