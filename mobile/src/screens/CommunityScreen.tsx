import React, { useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import CountryFlag from "react-native-country-flag";
import { useMemo } from "react";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchPeople } from "../services/api/auth";
import { PartnerCard } from "../components/PartnerCard";
import type { ProfileListResponse } from "../types";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";

const LANGUAGE_ISO_MAP: Record<string, string> = {
  arabic: "sa",
  chinese: "cn",
  dutch: "nl",
  english: "gb",
  french: "fr",
  german: "de",
  greek: "gr",
  hindi: "in",
  italian: "it",
  japanese: "jp",
  korean: "kr",
  portuguese: "pt",
  russian: "ru",
  spanish: "es",
  swedish: "se",
  turkish: "tr",
  ukrainian: "ua",
};

const normalizeLanguage = (value = "") => String(value).trim().toLowerCase();

const toLanguageLabel = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getLanguageIsoCode = (language?: string | null) => {
  if (!language) return null;
  return LANGUAGE_ISO_MAP[normalizeLanguage(language)] || null;
};

export function CommunityScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [data, setData] = useState<ProfileListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeSegment, setActiveSegment] = useState<"all" | "nearby" | "travel">("all");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [draftSelectedLanguages, setDraftSelectedLanguages] = useState<string[]>([]);
  const [isLanguageFilterOpen, setIsLanguageFilterOpen] = useState(false);

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

  useEffect(() => {
    const prefillLanguage = route.params?.prefillLanguage;
    if (!prefillLanguage) return;
    const next = [normalizeLanguage(prefillLanguage)];
    setSelectedLanguages(next);
    setDraftSelectedLanguages(next);
    setSearchText("");
  }, [route.params?.fromMissionAt, route.params?.prefillLanguage]);

  const people = data?.profiles || [];

  const languageOptions = useMemo(() => {
    const allLanguages = new Map<string, string>();
    for (const profile of people) {
      if (profile.native_language) {
        const normalized = normalizeLanguage(profile.native_language);
        if (normalized && !allLanguages.has(normalized)) {
          allLanguages.set(normalized, toLanguageLabel(profile.native_language));
        }
      }
      for (const lang of profile.languages_practicing || []) {
        const normalized = normalizeLanguage(lang);
        if (normalized && !allLanguages.has(normalized)) {
          allLanguages.set(normalized, toLanguageLabel(lang));
        }
      }
    }
    return Array.from(allLanguages.entries())
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([value, label]) => ({
        value,
        label,
        isoCode: getLanguageIsoCode(value),
      }));
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

      const personLanguages = [
        normalizeLanguage(person.native_language || ""),
        ...(person.languages_practicing || []).map((lang) => normalizeLanguage(lang)),
      ].filter(Boolean);

      const matchesLanguage =
        selectedLanguages.length === 0 ||
        selectedLanguages.some((language) => personLanguages.includes(language));

      return matchesSearch && matchesLanguage;
    });
  }, [people, searchText, selectedLanguages]);

  const toggleLanguageFilter = (language: string) => {
    setDraftSelectedLanguages((prev) =>
      prev.includes(language)
        ? prev.filter((entry) => entry !== language)
        : [...prev, language]
    );
  };

  const openLanguageFilter = () => {
    setDraftSelectedLanguages(selectedLanguages);
    setIsLanguageFilterOpen(true);
  };

  const selectedLanguageLabel = useMemo(() => {
    if (selectedLanguages.length === 0) return "Filter by language";
    if (selectedLanguages.length === 1) {
      return languageOptions.find((option) => option.value === selectedLanguages[0])?.label || "1 language";
    }
    return `${selectedLanguages.length} languages`;
  }, [languageOptions, selectedLanguages]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
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
            <View style={styles.searchRow}>
              <View style={styles.searchFieldWrap}>
                <TextInput
                  style={styles.searchInputInline}
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Search by username or language..."
                  placeholderTextColor={colors.mutedText}
                />
              </View>
              <Pressable
                style={[
                  styles.filterIconButton,
                  selectedLanguages.length > 0 && styles.filterButtonActive,
                ]}
                onPress={openLanguageFilter}
              >
                <Ionicons
                  name="funnel-outline"
                  size={18}
                  color={selectedLanguages.length > 0 ? colors.primary : colors.mutedText}
                />
                {selectedLanguages.length > 0 ? (
                  <View style={styles.filterCountBadge}>
                    <Text style={styles.filterCountBadgeText}>{selectedLanguages.length}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
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

      <Modal
        visible={isLanguageFilterOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsLanguageFilterOpen(false)}
      >
        <View style={styles.filterModalBackdrop}>
          <Pressable style={styles.filterModalOverlay} onPress={() => setIsLanguageFilterOpen(false)} />
          <View style={styles.filterModalSheet}>
            <View style={styles.filterModalHandle} />
            <View style={styles.filterModalHeader}>
              <View>
                <Text style={styles.filterModalTitle}>Choose languages</Text>
                <Text style={styles.filterModalSubtitle}>
                  Show people who speak or practice any selected language.
                </Text>
              </View>
            </View>

            {draftSelectedLanguages.length > 0 ? (
              <View style={styles.filterSelectedRow}>
                {draftSelectedLanguages.map((language) => {
                  const option = languageOptions.find((entry) => entry.value === language);
                  if (!option) return null;
                  return (
                    <Pressable
                      key={`selected-${language}`}
                      style={styles.filterSelectedChip}
                      onPress={() => toggleLanguageFilter(language)}
                    >
                      <Text style={styles.filterSelectedChipText}>{option.label}</Text>
                      <Ionicons name="close" size={12} color={colors.primary} />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.filterOptionList}>
              {languageOptions.map((language) => {
                const active = draftSelectedLanguages.includes(language.value);
                return (
                  <Pressable
                    key={language.value}
                    style={[styles.filterOptionRow, active && styles.filterOptionRowActive]}
                    onPress={() => toggleLanguageFilter(language.value)}
                  >
                    <View style={styles.filterOptionContent}>
                      <View style={styles.filterOptionFlagWrap}>
                        {language.isoCode ? (
                          <CountryFlag isoCode={language.isoCode} size={18} />
                        ) : (
                          <Ionicons name="globe-outline" size={16} color={colors.mutedText} />
                        )}
                      </View>
                      <Text style={[styles.filterOptionText, active && styles.filterOptionTextActive]}>
                        {language.label}
                      </Text>
                    </View>
                    <View style={[styles.filterOptionIndicator, active && styles.filterOptionIndicatorActive]}>
                      {active ? (
                        <Ionicons name="checkmark" size={13} color="#fff" />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.filterModalFooter}>
              <Pressable style={styles.filterFooterSecondary} onPress={() => setDraftSelectedLanguages([])}>
                <Text style={styles.filterFooterSecondaryText}>Clear all</Text>
              </Pressable>
              <Pressable
                style={styles.filterFooterPrimary}
                onPress={() => {
                  setSelectedLanguages(draftSelectedLanguages);
                  setIsLanguageFilterOpen(false);
                }}
              >
                <Text style={styles.filterFooterPrimaryText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 8,
    },
    searchFieldWrap: {
      flex: 1,
    },
    searchInputInline: {
      backgroundColor: colors.inputBackground,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    filterIconButton: {
      width: 48,
      height: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    filterButtonActive: {
      backgroundColor: colors.surface,
      borderColor: `${colors.primary}33`,
    },
    filterCountBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
      position: "absolute",
      top: -4,
      right: -4,
    },
    filterCountBadgeText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 10,
    },
    filterModalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(8, 19, 32, 0.28)",
      justifyContent: "flex-end",
    },
    filterModalOverlay: {
      ...StyleSheet.absoluteFillObject,
    },
    filterModalSheet: {
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 18,
      gap: 14,
      maxHeight: "78%",
    },
    filterModalHandle: {
      alignSelf: "center",
      width: 40,
      height: 5,
      borderRadius: 999,
      backgroundColor: colors.border,
      marginBottom: 8,
    },
    filterModalHeader: {
      gap: 4,
    },
    filterModalTitle: {
      color: colors.text,
      fontSize: 24,
      fontWeight: "800",
    },
    filterModalSubtitle: {
      color: colors.mutedText,
      fontSize: 14,
      lineHeight: 20,
    },
    filterSelectedRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    filterSelectedChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      backgroundColor: colors.activeChipBackground,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    filterSelectedChipText: {
      color: colors.activeChipText,
      fontWeight: "600",
      fontSize: 13,
    },
    filterOptionList: {
      gap: 8,
    },
    filterOptionContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
      minWidth: 0,
    },
    filterOptionFlagWrap: {
      width: 22,
      height: 22,
      borderRadius: 11,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    filterOptionRow: {
      minHeight: 54,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    filterOptionRowActive: {
      borderColor: colors.primary,
      backgroundColor: colors.activeChipBackground,
    },
    filterOptionText: {
      color: colors.text,
      fontWeight: "600",
      fontSize: 14,
      textTransform: "capitalize",
    },
    filterOptionTextActive: {
      color: colors.text,
    },
    filterOptionIndicator: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    filterOptionIndicatorActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterModalFooter: {
      flexDirection: "row",
      gap: 10,
      marginTop: 4,
    },
    filterFooterSecondary: {
      flex: 1,
      minHeight: 46,
      borderRadius: 14,
      backgroundColor: colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    filterFooterSecondaryText: {
      color: colors.text,
      fontWeight: "600",
      fontSize: 14,
    },
    filterFooterPrimary: {
      flex: 1.2,
      minHeight: 46,
      borderRadius: 14,
      backgroundColor: colors.navy,
      alignItems: "center",
      justifyContent: "center",
    },
    filterFooterPrimaryText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 14,
    },
    empty: {
      color: colors.mutedText,
      textAlign: "center",
      marginTop: 32,
    },
  });
