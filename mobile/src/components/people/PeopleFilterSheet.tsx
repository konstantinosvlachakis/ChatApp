import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";
import { LEVEL_OPTIONS, languageLabel, type PeopleLevel } from "../../features/peopleMatching";
import { fontFamilies } from "../../theme/typography";
import { warmColors, type WarmColors } from "../../theme/warm";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Applied filters; the sheet edits a draft and only applies on "Show people". */
  nativeFilter: string;
  level: PeopleLevel;
  languageOptions: string[];
  /** Viewer's native language: the level filter is "their <viewer language> level". */
  viewerLanguage: string;
  onApply: (next: { nativeFilter: string; level: PeopleLevel }) => void;
  onReset: () => void;
};

/** "Find your exchange" bottom sheet (mirrors web `FilterSheet`). */
export function PeopleFilterSheet({ visible, onClose, nativeFilter, level, languageOptions, viewerLanguage, onApply, onReset }: Props) {
  const { isDark } = useTheme();
  const warm = warmColors(isDark);
  const styles = useMemo(() => createStyles(warm), [warm]);
  const [draftNative, setDraftNative] = useState(nativeFilter);
  const [draftLevel, setDraftLevel] = useState<PeopleLevel>(level);

  // Re-sync the draft only when the sheet opens (applied values may change underneath it).
  useEffect(() => {
    if (!visible) return;
    setDraftNative(nativeFilter);
    setDraftLevel(level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const levelTitle = viewerLanguage ? `Their ${languageLabel(viewerLanguage)} level` : "Their practice level";
  const nativeChoices = ["", ...languageOptions];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close filters" />
        <SafeAreaView edges={["bottom"]} style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.heading}>
            <Text style={styles.title} accessibilityRole="header">Find your exchange</Text>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close filters" hitSlop={4}>
              <Ionicons name="close" size={22} color={warm.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} bounces={false}>
            <Text style={styles.label}>Their native language</Text>
            <View style={styles.pillRow} accessibilityRole="radiogroup" accessibilityLabel="Their native language">
              {nativeChoices.map((language) => {
                const selected = language.toLowerCase() === draftNative.toLowerCase();
                return (
                  <Pressable
                    key={language || "all"}
                    onPress={() => setDraftNative(language)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    style={[styles.pill, selected && styles.pillSelected]}
                  >
                    <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                      {language ? languageLabel(language) : "All languages"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>From the profiles loaded so far.</Text>

            <Text style={styles.label}>{levelTitle}</Text>
            <View style={styles.pillRow} accessibilityRole="radiogroup" accessibilityLabel={levelTitle}>
              {LEVEL_OPTIONS.map((entry) => {
                const selected = draftLevel === entry;
                const disabled = !viewerLanguage && entry !== "";
                return (
                  <Pressable
                    key={entry || "any"}
                    onPress={() => setDraftLevel(entry)}
                    disabled={disabled}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected, disabled }}
                    style={[styles.pill, selected && styles.pillSelected, disabled && styles.pillDisabled]}
                  >
                    <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{entry ? languageLabel(entry) : "Any"}</Text>
                  </Pressable>
                );
              })}
            </View>
            {!viewerLanguage ? <Text style={styles.hint}>Add your native language to filter by level.</Text> : null}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable
              onPress={() => {
                setDraftNative("");
                setDraftLevel("");
                onReset();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.footerButton, styles.resetButton, pressed && styles.pressed]}
            >
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
            <Pressable
              onPress={() => onApply({ nativeFilter: draftNative, level: draftLevel })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.footerButton, styles.applyButton, pressed && styles.pressed]}
            >
              <Text style={styles.applyText}>Show people</Text>
              <Ionicons name="arrow-forward" size={16} color={warm.onAction} />
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: warm.scrim,
    },
    sheet: {
      maxHeight: "82%",
      backgroundColor: warm.paper,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 5,
      borderRadius: 999,
      backgroundColor: warm.lineWarm,
      marginBottom: 6,
    },
    heading: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    title: {
      color: warm.ink,
      fontSize: 22,
      fontFamily: fontFamilies.displayBold,
    },
    closeButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    body: {
      paddingBottom: 8,
    },
    label: {
      color: warm.ink,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
      marginTop: 14,
      marginBottom: 10,
    },
    hint: {
      color: warm.mutedInk,
      fontSize: 12,
      marginTop: 8,
      fontFamily: fontFamilies.bodyMedium,
    },
    pillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    pill: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 16,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      backgroundColor: warm.secondary,
    },
    pillSelected: {
      backgroundColor: warm.sage,
      borderColor: warm.teal,
    },
    pillDisabled: {
      opacity: 0.45,
    },
    pillText: {
      color: warm.ink,
      fontSize: 13,
      fontFamily: fontFamilies.bodySemiBold,
    },
    pillTextSelected: {
      color: warm.teal,
      fontFamily: fontFamilies.bodyBold,
    },
    footer: {
      flexDirection: "row",
      gap: 10,
      paddingTop: 12,
      paddingBottom: 14,
    },
    footerButton: {
      minHeight: 48,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    resetButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      backgroundColor: warm.secondary,
    },
    resetText: {
      color: warm.ink,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
    },
    applyButton: {
      flex: 1.6,
      backgroundColor: warm.action,
    },
    applyText: {
      color: warm.onAction,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
    },
    pressed: {
      opacity: 0.85,
    },
  });
