import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PEOPLE_SEGMENTS, languageLabel, type PeopleSegment } from "../../features/peopleMatching";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";

const MODE_PRESENTATION: Record<PeopleSegment, {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}> = {
  all: { label: "For you", icon: "sparkles-outline", description: "Explore people for your next language exchange." },
  reciprocal: { label: "Mutual", icon: "swap-horizontal-outline", description: "You speak their target language. They speak yours." },
  teaches_me: { label: "Native", icon: "chatbubble-ellipses-outline", description: "Meet native speakers of a language you’re learning." },
};

type Props = {
  warm: WarmColors;
  nativeLanguage: string;
  practicingLanguages: string[];
  search: string;
  onSearchChange: (value: string) => void;
  segment: PeopleSegment;
  onSegmentChange: (value: PeopleSegment) => void;
  filterCount: number;
  onOpenFilters: () => void;
  onEditLanguages: () => void;
  countText: string;
};

/** Controls stay visible without a horizontal scroller, including on narrow phones. */
export function PeopleDiscoveryHeader({
  warm, nativeLanguage, practicingLanguages, search, onSearchChange, segment,
  onSegmentChange, filterCount, onOpenFilters, onEditLanguages, countText,
}: Props) {
  const styles = useMemo(() => createStyles(warm), [warm]);
  const { fontScale } = useWindowDimensions();
  const selectedMode = MODE_PRESENTATION[segment];
  const learning = practicingLanguages.length ? languageLabel(practicingLanguages[0]) : "Add a language";
  const extraLanguages = Math.max(0, practicingLanguages.length - 1);

  return (
    <View style={styles.header}>
      <View style={styles.intro}>
        <Text style={styles.title} accessibilityRole="header">Find your people.</Text>
        <Text style={styles.subtitle}>A new language. A real conversation.</Text>
      </View>

      <View style={styles.exchange}>
        <View style={styles.language}>
          <Text style={styles.languageCaption}>I speak</Text>
          <Text style={styles.languageName} numberOfLines={2}>{nativeLanguage ? languageLabel(nativeLanguage) : "Add a language"}</Text>
        </View>
        <View style={styles.swapIcon} accessibilityElementsHidden importantForAccessibility="no">
          <Ionicons name="swap-horizontal-outline" size={19} color={warm.teal} />
        </View>
        <View style={styles.language}>
          <Text style={styles.languageCaption}>I’m learning</Text>
          <Text style={styles.languageName} numberOfLines={2}>
            {learning}{extraLanguages > 0 ? <Text style={styles.extraLanguages}> +{extraLanguages}</Text> : null}
          </Text>
        </View>
        <Pressable
          onPress={onEditLanguages}
          accessibilityRole="button"
          accessibilityLabel="Edit your exchange languages"
          accessibilityHint="Opens your profile"
          style={({ pressed }) => [styles.editIcon, pressed && styles.pressed]}
        >
          <Ionicons name="pencil-outline" size={17} color={warm.inkSoft} />
        </Pressable>
      </View>

      <View style={[styles.searchRow, fontScale > 1.3 && styles.searchRowLargeText]}>
        <View style={styles.searchField}>
          <Ionicons name="search-outline" size={20} color={warm.mutedInk} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={onSearchChange}
            placeholder="Search people"
            placeholderTextColor={warm.mutedInk}
            accessibilityLabel="Search loaded profiles"
            accessibilityHint="Search by name, language or learning goal in the profiles loaded so far"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search ? (
            <Pressable onPress={() => onSearchChange("")} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clearSearch}>
              <Ionicons name="close-circle" size={18} color={warm.mutedInk} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={onOpenFilters}
          accessibilityRole="button"
          accessibilityLabel={filterCount ? `Filters, ${filterCount} active` : "Filters"}
          accessibilityHint="Choose a native language and practice level"
          style={({ pressed }) => [styles.filters, filterCount > 0 && styles.filtersActive, pressed && styles.pressed]}
        >
          <Ionicons name="options-outline" size={19} color={filterCount ? warm.teal : warm.ink} />
          <Text style={[styles.filtersLabel, filterCount > 0 && styles.filtersLabelActive]}>Filters</Text>
          {filterCount > 0 ? <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{filterCount}</Text></View> : null}
        </Pressable>
      </View>

      <View>
        <View style={styles.modes} accessibilityRole="tablist" accessibilityLabel="Exchange type">
          {PEOPLE_SEGMENTS.map((entry) => {
            const mode = MODE_PRESENTATION[entry.key];
            const selected = segment === entry.key;
            return (
              <Pressable
                key={entry.key}
                onPress={() => onSegmentChange(entry.key)}
                accessibilityRole="tab"
                accessibilityLabel={entry.label}
                accessibilityState={{ selected }}
                accessibilityHint={mode.description}
                style={({ pressed }) => [styles.mode, fontScale > 1.3 && styles.modeLargeText, selected && styles.modeSelected, pressed && styles.pressed]}
              >
                <Ionicons name={mode.icon} size={18} color={selected ? warm.onAction : warm.mutedInk} />
                <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>{mode.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.modeDescription}>{search.trim() ? "Searching names, languages and goals in loaded profiles." : selectedMode.description}</Text>
      </View>
      <Text style={styles.count} accessibilityLiveRegion="polite">{countText}</Text>
    </View>
  );
}

const createStyles = (warm: WarmColors) => StyleSheet.create({
  header: { gap: 10, paddingBottom: 10 },
  intro: { gap: 4 },
  title: { color: warm.ink, fontSize: 27, lineHeight: 35, fontFamily: fontFamilies.displayBold },
  subtitle: { color: warm.mutedInk, fontSize: 14, lineHeight: 20, fontFamily: fontFamilies.bodyMedium },
  exchange: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, paddingLeft: 16, minHeight: 68, backgroundColor: warm.paper, borderWidth: 1, borderColor: warm.lineWarm, borderRadius: 20 },
  language: { flex: 1, minWidth: 0, gap: 3 },
  languageCaption: { color: warm.mutedInk, fontSize: 11, lineHeight: 16, fontFamily: fontFamilies.bodyMedium },
  languageName: { color: warm.ink, fontSize: 14, lineHeight: 20, fontFamily: fontFamilies.bodyBold },
  extraLanguages: { color: warm.teal, fontFamily: fontFamilies.bodySemiBold },
  swapIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: warm.sage },
  editIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: warm.cream },
  searchRow: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  searchRowLargeText: { flexDirection: "column" },
  searchField: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 50, paddingLeft: 14, paddingRight: 4, borderRadius: 16, borderWidth: 1, borderColor: warm.line, backgroundColor: warm.paper },
  searchInput: { flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 10, color: warm.ink, fontSize: 14, fontFamily: fontFamilies.bodyMedium },
  clearSearch: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  filters: { minHeight: 50, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: warm.line, borderRadius: 16, backgroundColor: warm.paper },
  filtersActive: { backgroundColor: warm.sage, borderColor: warm.teal },
  filtersLabel: { color: warm.ink, fontSize: 13, fontFamily: fontFamilies.bodyBold },
  filtersLabelActive: { color: warm.teal },
  filterBadge: { backgroundColor: warm.action, minWidth: 20, minHeight: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  filterBadgeText: { color: warm.onAction, fontSize: 11, fontFamily: fontFamilies.bodyBold },
  modes: { flexDirection: "row", alignItems: "stretch", gap: 4, borderRadius: 18, padding: 4, backgroundColor: warm.creamDeep },
  mode: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: "row", paddingVertical: 10, paddingHorizontal: 4, gap: 5, justifyContent: "center", alignItems: "center", borderRadius: 14 },
  modeLargeText: { flexDirection: "column" },
  modeSelected: { backgroundColor: warm.action },
  modeLabel: { color: warm.mutedInk, fontSize: 12, lineHeight: 17, flexShrink: 1, textAlign: "center", fontFamily: fontFamilies.bodyBold },
  modeLabelSelected: { color: warm.onAction },
  modeDescription: { color: warm.mutedInk, fontSize: 12, lineHeight: 18, marginTop: 8, paddingHorizontal: 2, fontFamily: fontFamilies.bodyMedium },
  count: { color: warm.inkSoft, fontSize: 12, lineHeight: 18, fontFamily: fontFamilies.bodySemiBold },
  pressed: { opacity: 0.72 },
});
