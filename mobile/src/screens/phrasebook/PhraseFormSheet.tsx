import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { languageLabel } from "../../features/corrections";
import { toApiError } from "../../services/api/errors";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";
import type { PhrasebookEntry } from "../../types";
import { KeyboardSheet } from "../chat/KeyboardSheet";

export type PhraseFormState = { mode: "add" } | { mode: "edit"; entry: PhrasebookEntry } | null;

export type PhraseFormValues = { text: string; meaning: string; note: string; context: string; language: string };

type PhraseFormSheetProps = {
  warm: WarmColors;
  reduceMotion: boolean;
  state: PhraseFormState;
  /** Language chips (lowercase names); "" = no language. */
  languageOptions: string[];
  defaultLanguage: string;
  onClose: () => void;
  /** Resolves when saved (the screen closes the sheet); throws to show the error here. */
  onSubmit: (values: PhraseFormValues) => Promise<void>;
};

const TEXT_MAX = 500;
const FIELD_MAX = 1000;

/** Add a phrase by hand, or edit a saved one (context is only set when adding). */
export function PhraseFormSheet({
  warm,
  reduceMotion,
  state,
  languageOptions,
  defaultLanguage,
  onClose,
  onSubmit,
}: PhraseFormSheetProps) {
  const styles = useMemo(() => createStyles(warm), [warm]);
  const [text, setText] = useState("");
  const [meaning, setMeaning] = useState("");
  const [note, setNote] = useState("");
  const [context, setContext] = useState("");
  const [language, setLanguage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const stateKey = state ? (state.mode === "edit" ? `edit:${state.entry.id}` : "add") : "";
  useEffect(() => {
    if (!state) return;
    const entry = state.mode === "edit" ? state.entry : null;
    setText(entry?.text || "");
    setMeaning(entry?.meaning || "");
    setNote(entry?.note || "");
    setContext(entry?.context || "");
    setLanguage(entry ? entry.language || "" : defaultLanguage);
    setError("");
    setSaving(false);
    // Reset only when another entry (or add mode) opens the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey]);

  const chips = useMemo(() => {
    const set = new Set(languageOptions.filter(Boolean));
    if (language) set.add(language);
    return [...set];
  }, [language, languageOptions]);

  const canSave = Boolean(text.trim()) && !saving;
  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit({ text: text.trim(), meaning: meaning.trim(), note: note.trim(), context: context.trim(), language });
    } catch (caught) {
      const apiError = toApiError(caught);
      if (!apiError.isAborted) {
        setError(apiError.code === "unknown" ? "Could not save this phrase." : apiError.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const isEdit = state?.mode === "edit";
  return (
    <KeyboardSheet warm={warm} visible={Boolean(state)} reduceMotion={reduceMotion} onClose={onClose}>
      {state ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={styles.title} accessibilityRole="header">
            {isEdit ? "Edit phrase" : "Add a phrase"}
          </Text>

          <Text style={styles.label}>Phrase</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            maxLength={TEXT_MAX}
            multiline
            autoFocus={!isEdit}
            placeholder="¿Qué tal?"
            placeholderTextColor={warm.mutedInk}
            accessibilityLabel="Phrase"
          />

          <Text style={styles.label}>Meaning (optional)</Text>
          <TextInput
            style={styles.input}
            value={meaning}
            onChangeText={setMeaning}
            maxLength={FIELD_MAX}
            multiline
            placeholder="How's it going?"
            placeholderTextColor={warm.mutedInk}
            accessibilityLabel="Meaning, optional"
          />

          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            maxLength={FIELD_MAX}
            multiline
            placeholder="Informal greeting"
            placeholderTextColor={warm.mutedInk}
            accessibilityLabel="Note, optional"
          />

          {!isEdit ? (
            <>
              <Text style={styles.label}>Example or context (optional)</Text>
              <TextInput
                style={styles.input}
                value={context}
                onChangeText={setContext}
                maxLength={FIELD_MAX}
                multiline
                placeholder="Where you heard or used it"
                placeholderTextColor={warm.mutedInk}
                accessibilityLabel="Example or context, optional"
              />
            </>
          ) : null}

          <Text style={styles.label}>Language</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {["", ...chips].map((value) => {
              const selected = value === language;
              return (
                <Pressable
                  key={value || "none"}
                  style={[styles.chip, selected && styles.chipActive]}
                  onPress={() => setLanguage(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={value ? languageLabel(value) : "No language"}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                    {value ? languageLabel(value) : "None"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.primary, !canSave && styles.disabled, pressed && styles.pressed]}
              onPress={handleSave}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityLabel={isEdit ? "Save changes" : "Add phrase"}
              accessibilityState={{ disabled: !canSave, busy: saving }}
            >
              {saving ? (
                <ActivityIndicator color={warm.onNavy} />
              ) : (
                <Text style={styles.primaryText}>{isEdit ? "Save" : "Add"}</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      ) : null}
    </KeyboardSheet>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    content: { gap: 8, paddingBottom: 4 },
    title: { color: warm.ink, fontSize: 20, fontFamily: fontFamilies.displayBold, textAlign: "center", marginBottom: 4 },
    label: { color: warm.inkSoft, fontSize: 12, fontFamily: fontFamilies.bodyExtraBold, marginTop: 4 },
    input: {
      minHeight: 44,
      maxHeight: 120,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.paper,
      color: warm.ink,
      fontSize: 15,
      fontFamily: fontFamilies.bodySemiBold,
      textAlignVertical: "top",
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      minHeight: 36,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.paper,
      alignItems: "center",
      justifyContent: "center",
    },
    chipActive: { backgroundColor: warm.navy, borderColor: warm.navy },
    chipText: { color: warm.ink, fontSize: 13, fontFamily: fontFamilies.bodyBold },
    chipTextActive: { color: warm.onNavy },
    error: { color: warm.danger, fontSize: 13, lineHeight: 18, fontFamily: fontFamilies.bodyBold },
    actions: { flexDirection: "row", gap: 10, marginTop: 8 },
    secondary: {
      flex: 1,
      minHeight: 46,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.line,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryText: { color: warm.ink, fontSize: 15, fontFamily: fontFamilies.bodyBold },
    primary: {
      flex: 1,
      minHeight: 46,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.navy,
    },
    primaryText: { color: warm.onNavy, fontSize: 15, fontFamily: fontFamilies.bodyBold },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.85 },
  });
