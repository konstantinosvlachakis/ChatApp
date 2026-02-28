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
import { useNavigation } from "@react-navigation/native";
import { fetchPeople } from "../services/api/auth";
import { PartnerCard } from "../components/PartnerCard";
import type { ProfileListResponse } from "../types";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";

export function CommunityScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [data, setData] = useState<ProfileListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeSegment, setActiveSegment] = useState<"all" | "nearby" | "travel">("all");
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
            <View style={styles.segmentRow}>
              <Pressable
                style={[styles.segmentButton, activeSegment === "all" && styles.segmentButtonActive]}
                onPress={() => setActiveSegment("all")}
              >
                <Text
                  style={[
                    styles.segmentButtonText,
                    activeSegment === "all" && styles.segmentButtonTextActive,
                  ]}
                >
                  All members
                </Text>
              </Pressable>
              <Pressable
                style={[styles.segmentButton, activeSegment === "nearby" && styles.segmentButtonActive]}
                onPress={() => setActiveSegment("nearby")}
              >
                <Text
                  style={[
                    styles.segmentButtonText,
                    activeSegment === "nearby" && styles.segmentButtonTextActive,
                  ]}
                >
                  Nearby
                </Text>
              </Pressable>
              <Pressable
                style={[styles.segmentButton, activeSegment === "travel" && styles.segmentButtonActive]}
                onPress={() => setActiveSegment("travel")}
              >
                <Text
                  style={[
                    styles.segmentButtonText,
                    activeSegment === "travel" && styles.segmentButtonTextActive,
                  ]}
                >
                  Travel
                </Text>
              </Pressable>
            </View>
            <Text style={styles.title}>Discover Language Partners</Text>
            <Text style={styles.subtitle}>Find members by language and start chatting.</Text>
            <TextInput
              style={styles.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search by username or language..."
              placeholderTextColor={colors.mutedText}
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
            onPress={() =>
              navigation.navigate("PublicProfile", {
                username: item.username,
                profile: item,
              })
            }
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>No people found.</Text>}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerWrap: {
      marginBottom: 12,
    },
    segmentRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 12,
    },
    segmentButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    segmentButtonActive: {
      backgroundColor: colors.activeChipBackground,
      borderColor: colors.activeChipBackground,
    },
    segmentButtonText: {
      color: colors.text,
      fontWeight: "600",
      fontSize: 13,
    },
    segmentButtonTextActive: {
      color: colors.activeChipText,
    },
    title: {
      fontSize: 30,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 4,
    },
    subtitle: {
      color: colors.mutedText,
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
      backgroundColor: colors.inputBackground,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
      marginBottom: 10,
    },
    filterRow: {
      gap: 8,
      paddingBottom: 4,
    },
    filterChip: {
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    filterChipActive: {
      backgroundColor: colors.activeChipBackground,
      borderColor: colors.activeChipBackground,
    },
    filterChipText: {
      color: colors.text,
      fontWeight: "600",
      fontSize: 13,
    },
    filterChipTextActive: {
      color: colors.activeChipText,
    },
    empty: {
      color: colors.mutedText,
      textAlign: "center",
      marginTop: 32,
    },
  });
