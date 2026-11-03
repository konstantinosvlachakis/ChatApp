import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";
import {
  DEFAULT_PANEL_FILTERS,
  INCLUDE_GROUPS,
  INCLUDE_LABELS,
  LEVEL_FILTER_OPTIONS,
  SORT_OPTIONS,
  isLanguageOn,
  languageLabel,
  toggleLanguage,
  type PanelFilters,
} from "../../features/peopleMatching";
import { fontFamilies } from "../../theme/typography";
import { warmColors, type WarmColors } from "../../theme/warm";

const COUNT_DEBOUNCE_MS = 250;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Applied filters; the sheet edits a draft and applies it on "Show N people". */
  filters: PanelFilters;
  theySpeakOptions: string[];
  theyLearnOptions: string[];
  onApply: (next: PanelFilters) => void;
  /** People matching a draft (both sections), or null. Aborted when the draft changes. */
  countFor: (draft: PanelFilters, signal: AbortSignal) => Promise<number | null>;
};

/** Filters bottom sheet (mirrors web `PeopleFilterPanel`, mockup F). */
export function PeopleFilterSheet({ visible, onClose, filters, theySpeakOptions, theyLearnOptions, onApply, countFor }: Props) {
  const { isDark } = useTheme();
  const warm = warmColors(isDark);
  const styles = useMemo(() => createStyles(warm), [warm]);
  const [draft, setDraft] = useState<PanelFilters>(filters);
  const [count, setCount] = useState<number | null>(null);

  // Re-sync the draft only when the sheet opens (applied values may change underneath it).
  useEffect(() => {
    if (visible) setDraft(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    setCount(null);
    const timer = setTimeout(() => {
      countFor(draft, controller.signal)
        .then((total) => {
          if (!controller.signal.aborted) setCount(total);
        })
        .catch(() => {});
    }, COUNT_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [visible, draft, countFor]);

  const update = (patch: Partial<PanelFilters>) => setDraft((current) => ({ ...current, ...patch }));
  const showLabel = count === null ? "Show people" : `Show ${count} ${count === 1 ? "person" : "people"}`;

  const chip = (key: string, label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="togglebutton"
      accessibilityState={{ checked: selected }}
      style={[styles.pill, selected && styles.pillSelected]}
    >
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close filters" />
        <SafeAreaView edges={["bottom"]} style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.heading}>
            <Text style={styles.title} accessibilityRole="header">Filters</Text>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close filters" hitSlop={4}>
              <Ionicons name="close" size={22} color={warm.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} bounces={false}>
            {theySpeakOptions.length ? (
              <>
                <Text style={styles.label} accessibilityRole="header">They speak</Text>
                <View style={styles.pillRow}>
                  {theySpeakOptions.map((language) =>
                    chip(language, languageLabel(language), isLanguageOn(draft.theySpeak, language), () =>
                      update({ theySpeak: toggleLanguage(draft.theySpeak, language, theySpeakOptions) })
                    )
                  )}
                </View>
              </>
            ) : null}
            {theyLearnOptions.length ? (
              <>
                <Text style={styles.label} accessibilityRole="header">They’re learning</Text>
                <View style={styles.pillRow}>
                  {theyLearnOptions.map((language) =>
                    chip(language, languageLabel(language), isLanguageOn(draft.theyLearn, language), () =>
                      update({ theyLearn: toggleLanguage(draft.theyLearn, language, theyLearnOptions) })
                    )
                  )}
                </View>
              </>
            ) : null}
            <Text style={styles.label} accessibilityRole="header">Their level in your language</Text>
            <View style={styles.pillRow}>
              {LEVEL_FILTER_OPTIONS.map((option) => chip(option.value || "any", option.label, draft.level === option.value, () => update({ level: option.value })))}
            </View>
            <Text style={styles.label} accessibilityRole="header">In “More people”, include</Text>
            {INCLUDE_GROUPS.map((group) => (
              <View key={group} style={styles.switchRow}>
                <Text style={styles.switchLabel}>{INCLUDE_LABELS[group]}</Text>
                <Switch
                  value={draft.include[group]}
                  onValueChange={(value) => update({ include: { ...draft.include, [group]: value } })}
                  accessibilityLabel={INCLUDE_LABELS[group]}
                  trackColor={{ true: warm.action, false: warm.lineWarm }}
                  thumbColor={warm.paper}
                />
              </View>
            ))}
            <Text style={styles.label} accessibilityRole="header">Sort by</Text>
            <View style={styles.pillRow}>
              {SORT_OPTIONS.map((option) => chip(option.value, option.label, draft.sort === option.value, () => update({ sort: option.value })))}
            </View>
            <Text style={styles.hint}>Perfect exchanges always show your best fit first.</Text>
          </ScrollView>
          <View style={styles.footer}>
            <Pressable
              onPress={() => setDraft(DEFAULT_PANEL_FILTERS)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.footerButton, styles.resetButton, pressed && styles.pressed]}
            >
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
            <Pressable
              onPress={() => onApply(draft)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.footerButton, styles.applyButton, pressed && styles.pressed]}
            >
              <Text style={styles.applyText}>{showLabel}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: warm.scrim },
    sheet: { maxHeight: "88%", backgroundColor: warm.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10 },
    handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 999, backgroundColor: warm.lineWarm, marginBottom: 6 },
    heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { color: warm.ink, fontSize: 22, fontFamily: fontFamilies.displayBold },
    closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    body: { paddingBottom: 8 },
    label: { color: warm.ink, fontSize: 14, fontFamily: fontFamilies.bodyExtraBold, marginTop: 16, marginBottom: 10 },
    hint: { color: warm.mutedInk, fontSize: 12, marginTop: 8, fontFamily: fontFamilies.bodyMedium },
    pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    pill: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: warm.lineWarm, backgroundColor: warm.secondary },
    pillSelected: { backgroundColor: warm.sage, borderColor: warm.teal },
    pillText: { color: warm.ink, fontSize: 13, fontFamily: fontFamilies.bodySemiBold },
    pillTextSelected: { color: warm.teal, fontFamily: fontFamilies.bodyBold },
    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 48 },
    switchLabel: { flex: 1, color: warm.ink, fontSize: 14, lineHeight: 20, fontFamily: fontFamilies.bodySemiBold },
    footer: { flexDirection: "row", gap: 10, paddingTop: 12, paddingBottom: 14 },
    footerButton: { minHeight: 48, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
    resetButton: { flex: 1, borderWidth: 1, borderColor: warm.lineWarm, backgroundColor: warm.secondary },
    resetText: { color: warm.ink, fontSize: 14, fontFamily: fontFamilies.bodyBold },
    applyButton: { flex: 1.6, backgroundColor: warm.action },
    applyText: { color: warm.onAction, fontSize: 14, fontFamily: fontFamilies.bodyBold },
    pressed: { opacity: 0.85 },
  });
