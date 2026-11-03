import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { QUICK_FILTER_KEYS, quickFilterLabel, type QuickFilters } from "../../features/peopleMatching";

const QUICK_ICONS: Record<keyof QuickFilters, React.ComponentProps<typeof Ionicons>["name"]> = {
  near: "location-outline",
  active: "time-outline",
  newMembers: "sparkles-outline",
  myLevel: "bar-chart-outline",
  following: "person-add-outline",
};
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";

type Props = {
  warm: WarmColors;
  /** "They speak Russian and are learning Greek or English." (`exchangeRule`). */
  rule: string;
  search: string;
  onSearchChange: (value: string) => void;
  filterCount: number;
  onOpenFilters: () => void;
  onEditLanguages: () => void;
  quick: QuickFilters;
  city: string;
  onToggleQuick: (key: keyof QuickFilters) => void;
};

/** Title + rule, search with the filter button (three-bars icon), and the quick filter pills. */
export function PeopleDiscoveryHeader({
  warm, rule, search, onSearchChange, filterCount, onOpenFilters, onEditLanguages, quick, city, onToggleQuick,
}: Props) {
  const styles = useMemo(() => createStyles(warm), [warm]);
  const { fontScale } = useWindowDimensions();

  return (
    <View style={styles.header}>
      <View style={styles.intro}>
        <Text style={styles.title} accessibilityRole="header">People to practise with</Text>
        <Text style={styles.subtitle}>{rule}</Text>
        <Pressable
          onPress={onEditLanguages}
          accessibilityRole="button"
          accessibilityHint="Opens your profile"
          style={({ pressed }) => [styles.editLink, pressed && styles.pressed]}
          hitSlop={8}
        >
          <Ionicons name="language-outline" size={14} color={warm.peachDeep} />
          <Text style={styles.editLinkText}>Edit languages</Text>
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
          accessibilityHint="Choose languages, level, who to include and sort order"
          style={({ pressed }) => [styles.filterButton, filterCount > 0 && styles.filterButtonActive, pressed && styles.pressed]}
        >
          <Ionicons name="filter" size={18} color={filterCount ? warm.onNavy : warm.ink} />
          {filterCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{filterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} style={styles.quickScroll} accessibilityLabel="Quick filters">
        {QUICK_FILTER_KEYS.map((key) => {
          const selected = quick[key];
          return (
            <Pressable
              key={key}
              onPress={() => onToggleQuick(key)}
              accessibilityRole="togglebutton"
              accessibilityState={{ checked: selected }}
              style={({ pressed }) => [styles.pill, selected && styles.pillSelected, pressed && styles.pressed]}
            >
              <Ionicons name={QUICK_ICONS[key]} size={15} color={selected ? warm.onNavy : warm.ink} />
              <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{quickFilterLabel(key, city)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const createStyles = (warm: WarmColors) => StyleSheet.create({
  header: { gap: 10, paddingBottom: 4 },
  intro: { gap: 2 },
  title: { color: warm.ink, fontSize: 22, lineHeight: 29, fontFamily: fontFamilies.displayBold },
  subtitle: { color: warm.mutedInk, fontSize: 13, lineHeight: 19, fontFamily: fontFamilies.bodyMedium },
  // A small soft-peach pill with a language icon (web `.people-languages-button`).
  editLink: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: warm.peachStrong, backgroundColor: warm.peachSoft },
  editLinkText: { color: warm.peachDeep, fontSize: 12, fontFamily: fontFamilies.bodyBold },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  searchRowLargeText: { flexDirection: "column", alignItems: "stretch" },
  searchField: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingLeft: 14, paddingRight: 4, borderRadius: 999, borderWidth: 1, borderColor: warm.line, backgroundColor: warm.paper },
  searchInput: { flex: 1, minWidth: 0, minHeight: 42, paddingVertical: 8, color: warm.ink, fontSize: 14, fontFamily: fontFamilies.bodyMedium },
  clearSearch: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  filterButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: warm.line, backgroundColor: warm.paper, alignSelf: "center" },
  filterButtonActive: { backgroundColor: warm.navy, borderColor: warm.navy },
  filterBadge: { position: "absolute", top: -3, right: -3, backgroundColor: warm.peachInk, minWidth: 20, minHeight: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  filterBadgeText: { color: "#ffffff", fontSize: 11, fontFamily: fontFamilies.bodyBold },
  quickScroll: { marginHorizontal: -16 },
  quick: { paddingHorizontal: 16, gap: 8 },
  pill: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: warm.lineWarm, backgroundColor: warm.paper },
  pillSelected: { backgroundColor: warm.navy, borderColor: warm.navy },
  pillText: { color: warm.ink, fontSize: 13, fontFamily: fontFamilies.bodySemiBold },
  pillTextSelected: { color: warm.onNavy, fontFamily: fontFamilies.bodyBold },
  pressed: { opacity: 0.72 },
});
