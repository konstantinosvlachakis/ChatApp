import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { filterProfileLanguages, type ProfileLanguageOption } from "../features/profileLanguages";
import type { ThemeColors } from "../theme/colors";
import { fontFamilies } from "../theme/typography";

type Props = {
  label: string;
  colors: ThemeColors;
  options: readonly ProfileLanguageOption[];
  selected: string[];
  multiple?: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
};

/** Inline picker works inside the edit-profile modal without stacking native modals. */
export function ProfileLanguageSelector({ label, colors, options, selected, multiple = false, expanded, onToggle, onSelect }: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState("");
  useEffect(() => { if (!expanded) setQuery(""); }, [expanded]);
  const matches = useMemo(() => filterProfileLanguages(options, query), [options, query]);
  const selectedOptions = options.filter((option) => selected.includes(option.value));

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {multiple && selectedOptions.length > 0 ? (
        <View style={styles.selectedLanguages}>
          {selectedOptions.map((option) => (
            <Pressable key={option.value} onPress={() => onSelect(option.value)}
              accessibilityRole="button" accessibilityLabel={`Remove ${option.label} from practice languages`}
              style={({ pressed }) => [styles.selectedChip, pressed && styles.pressed]}>
              <Text style={styles.selectedChipText}>{option.label}</Text>
              <Ionicons name="close" size={16} color={colors.activeChipText} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded }}
        accessibilityLabel={multiple ? "Add practice languages" : `Change ${label.toLowerCase()}`}
        style={({ pressed }) => [styles.trigger, expanded && styles.triggerOpen, pressed && styles.pressed]}>
        {multiple ? <Ionicons name="add-circle-outline" size={21} color={colors.primary} /> :
          <View style={styles.code}><Text style={styles.codeText}>{selectedOptions[0]?.code || "—"}</Text></View>}
        <Text style={[styles.triggerText, multiple && styles.addText]}>
          {multiple ? "Add a language" : selectedOptions[0]?.label || "Choose a language"}
        </Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedText} />
      </Pressable>

      {expanded ? (
        <View style={styles.panel}>
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={19} color={colors.mutedText} />
            <TextInput value={query} onChangeText={setQuery} style={styles.searchInput}
              placeholder="Search languages" placeholderTextColor={colors.mutedText}
              accessibilityLabel={`Search ${label.toLowerCase()}`} autoCorrect={false}
              autoCapitalize="none" returnKeyType="search" />
            {query ? <Pressable onPress={() => setQuery("")} accessibilityRole="button"
              accessibilityLabel="Clear language search" style={styles.clearSearch}>
              <Ionicons name="close-circle" size={18} color={colors.mutedText} />
            </Pressable> : null}
          </View>
          <ScrollView style={styles.results} nestedScrollEnabled keyboardShouldPersistTaps="handled"
            accessibilityLabel={`${label} choices`} showsVerticalScrollIndicator>
            {matches.map((option) => {
              const active = selected.includes(option.value);
              return <Pressable key={option.value} onPress={() => onSelect(option.value)}
                accessibilityRole={multiple ? "checkbox" : "radio"} accessibilityState={{ checked: active }}
                accessibilityLabel={option.label}
                style={({ pressed }) => [styles.option, active && styles.optionSelected, pressed && styles.pressed]}>
                <View style={styles.code}><Text style={styles.codeText}>{option.code}</Text></View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  {option.nativeLabel && option.nativeLabel !== option.label ? <Text style={styles.nativeLabel}>{option.nativeLabel}</Text> : null}
                </View>
                <Ionicons name={active ? "checkmark-circle" : multiple ? "ellipse-outline" : "radio-button-off-outline"}
                  size={21} color={active ? colors.primary : colors.mutedText} />
              </Pressable>;
            })}
            {matches.length === 0 ? <Text style={styles.empty}>No languages found. Try another name.</Text> : null}
          </ScrollView>
          <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={`Done choosing ${label.toLowerCase()}`} style={styles.done}>
            <Text style={styles.doneText}>{multiple ? `Done${selected.length ? ` · ${selected.length} selected` : ""}` : "Close"}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  field: { gap: 8 },
  label: { color: colors.text, fontSize: 14, fontFamily: fontFamilies.bodyBold },
  trigger: { minHeight: 52, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.inputBackground, flexDirection: "row", alignItems: "center", gap: 10 },
  triggerOpen: { borderColor: colors.primary },
  triggerText: { flex: 1, color: colors.text, fontSize: 14, fontFamily: fontFamilies.bodySemiBold },
  addText: { color: colors.primary },
  code: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  codeText: { color: colors.text, fontSize: 11, fontFamily: fontFamilies.bodyBold },
  selectedLanguages: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  selectedChip: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: colors.activeChipBackground, maxWidth: "100%" },
  selectedChipText: { color: colors.activeChipText, fontSize: 13, flexShrink: 1, fontFamily: fontFamilies.bodySemiBold },
  panel: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, overflow: "hidden", backgroundColor: colors.surface },
  searchRow: { flexDirection: "row", alignItems: "center", paddingLeft: 12, paddingRight: 4, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput: { flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 10, color: colors.text, fontSize: 14, fontFamily: fontFamilies.bodyMedium },
  clearSearch: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  results: { maxHeight: 240 },
  option: { minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  optionSelected: { backgroundColor: colors.surfaceMuted },
  optionCopy: { flex: 1, minWidth: 0, gap: 2 },
  optionLabel: { color: colors.text, fontSize: 14, fontFamily: fontFamilies.bodySemiBold },
  nativeLabel: { color: colors.mutedText, fontSize: 12, fontFamily: fontFamilies.bodyRegular },
  empty: { color: colors.mutedText, fontSize: 14, padding: 16, fontFamily: fontFamilies.bodyMedium },
  done: { minHeight: 46, alignItems: "center", justifyContent: "center", padding: 10, borderTopWidth: 1, borderTopColor: colors.border },
  doneText: { color: colors.primary, fontSize: 14, fontFamily: fontFamilies.bodyBold },
  pressed: { opacity: 0.7 },
});
