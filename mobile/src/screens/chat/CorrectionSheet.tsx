import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CorrectionDiffText } from "../../components/chat/CorrectionDiffText";
import { CORRECTION_NOTE_MAX, CORRECTION_TEXT_MAX, correctionErrorText } from "../../features/corrections";
import { diffWords, hasWordChanges } from "../../features/wordDiff";
import { toApiError } from "../../services/api/errors";
import { EMAIL_UNVERIFIED_CODE } from "../../features/emailVerification";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";
import type { ChatMessage, MessageCorrection } from "../../types";
import { KeyboardSheet } from "./KeyboardSheet";

export type CorrectionTarget = {
  message: ChatMessage;
  /** My existing correction (edit mode), else null. */
  existing: MessageCorrection | null;
} | null;

type CorrectionSheetProps = {
  warm: WarmColors;
  reduceMotion: boolean;
  target: CorrectionTarget;
  onClose: () => void;
  /** Resolves when saved (the sheet closes); throws to show the error inside the sheet. */
  onSubmit: (message: ChatMessage, correctedText: string, note: string) => Promise<void>;
  onRemove: (message: ChatMessage) => Promise<void>;
};

/** "Suggest a correction": corrected sentence (prefilled), optional note, live word-diff preview. */
export function CorrectionSheet({ warm, reduceMotion, target, onClose, onSubmit, onRemove }: CorrectionSheetProps) {
  const styles = useMemo(() => createStyles(warm), [warm]);
  const original = target?.message.text || "";
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState("");

  const targetKey = target ? `${target.message.id}:${target.existing?.id ?? "new"}` : "";
  useEffect(() => {
    if (!target) return;
    setText(target.existing?.corrected_text || target.message.text || "");
    setNote(target.existing?.note || "");
    setError("");
    setBusy(null);
    // Reset only when a different message/correction opens the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  const segments = useMemo(() => diffWords(original, text), [original, text]);
  const changed = hasWordChanges(segments);
  const trimmed = text.trim();
  const unchangedFromExisting =
    Boolean(target?.existing) &&
    trimmed === (target?.existing?.corrected_text || "").trim() &&
    note.trim() === (target?.existing?.note || "").trim();
  const canSave = Boolean(trimmed) && changed && !unchangedFromExisting && !busy;

  const showError = (caught: unknown, fallback: string) => {
    const apiError = toApiError(caught);
    if (apiError.isAborted || apiError.code === EMAIL_UNVERIFIED_CODE) {
      setError("");
      return;
    }
    setError(correctionErrorText(apiError.code, apiError.code === "unknown" ? fallback : apiError.message || fallback));
  };

  const handleSave = async () => {
    if (!target || !canSave) return;
    setBusy("save");
    setError("");
    try {
      await onSubmit(target.message, trimmed, note.trim());
    } catch (caught) {
      showError(caught, "Could not save your correction.");
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async () => {
    if (!target || busy) return;
    setBusy("remove");
    setError("");
    try {
      await onRemove(target.message);
    } catch (caught) {
      showError(caught, "Could not remove your correction.");
    } finally {
      setBusy(null);
    }
  };

  const author = target?.message.sender?.username || "";
  return (
    <KeyboardSheet warm={warm} visible={Boolean(target)} reduceMotion={reduceMotion} onClose={onClose}>
      {target ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={styles.title} accessibilityRole="header">
            {target.existing ? "Edit your correction" : "Suggest a correction"}
          </Text>

          <View style={styles.original}>
            <Text style={styles.label}>{author ? `${author} wrote` : "Original"}</Text>
            <Text style={styles.originalText} selectable>
              {original}
            </Text>
          </View>

          <Text style={styles.label} nativeID="correction-text-label">
            Corrected sentence
          </Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={CORRECTION_TEXT_MAX}
            autoCorrect={false}
            autoCapitalize="none"
            textAlignVertical="top"
            placeholder="Write the natural way to say it"
            placeholderTextColor={warm.mutedInk}
            accessibilityLabel="Corrected sentence"
            accessibilityLabelledBy="correction-text-label"
          />

          <View style={styles.noteHeader}>
            <Text style={styles.label}>Why? (optional)</Text>
            <Text style={styles.counter} accessibilityLabel={`${note.length} of ${CORRECTION_NOTE_MAX} characters`}>
              {note.length}/{CORRECTION_NOTE_MAX}
            </Text>
          </View>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={CORRECTION_NOTE_MAX}
            textAlignVertical="top"
            placeholder="E.g. “ir” is irregular in the past tense"
            placeholderTextColor={warm.mutedInk}
            accessibilityLabel="Why, optional note"
          />

          <View style={styles.preview} accessibilityLiveRegion="polite">
            <Text style={styles.label}>Preview</Text>
            {changed ? (
              <CorrectionDiffText original={original} corrected={text} segments={segments} warm={warm} />
            ) : (
              <Text style={styles.previewEmpty}>Change a word to see the correction.</Text>
            )}
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
              accessibilityLabel={target.existing ? "Save your correction" : "Send correction"}
              accessibilityState={{ disabled: !canSave, busy: busy === "save" }}
            >
              {busy === "save" ? (
                <ActivityIndicator color={warm.onNavy} />
              ) : (
                <Text style={styles.primaryText}>Save</Text>
              )}
            </Pressable>
          </View>

          {target.existing ? (
            <Pressable
              style={({ pressed }) => [styles.danger, Boolean(busy) && styles.disabled, pressed && styles.pressed]}
              onPress={handleRemove}
              disabled={Boolean(busy)}
              accessibilityRole="button"
              accessibilityLabel="Remove my correction"
              accessibilityState={{ disabled: Boolean(busy), busy: busy === "remove" }}
            >
              {busy === "remove" ? (
                <ActivityIndicator color={warm.danger} />
              ) : (
                <Text style={styles.dangerText}>Remove my correction</Text>
              )}
            </Pressable>
          ) : null}
        </ScrollView>
      ) : null}
    </KeyboardSheet>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    content: { gap: 10, paddingBottom: 4 },
    title: { color: warm.ink, fontSize: 20, fontFamily: fontFamilies.displayBold, textAlign: "center" },
    label: { color: warm.inkSoft, fontSize: 12, fontFamily: fontFamilies.bodyExtraBold },
    original: {
      borderRadius: 16,
      backgroundColor: warm.bubbleIn,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 2,
    },
    originalText: { color: warm.ink, fontSize: 15, lineHeight: 21, fontFamily: fontFamilies.bodyMedium },
    input: {
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.paper,
      color: warm.ink,
      fontSize: 15,
      fontFamily: fontFamilies.bodySemiBold,
    },
    inputMultiline: { minHeight: 72, maxHeight: 160 },
    noteInput: { minHeight: 56, maxHeight: 120 },
    noteHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    counter: { color: warm.mutedInk, fontSize: 12, fontFamily: fontFamilies.bodySemiBold },
    preview: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      backgroundColor: warm.cream,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 4,
    },
    previewEmpty: { color: warm.mutedInk, fontSize: 13, fontFamily: fontFamilies.bodyMedium },
    error: { color: warm.danger, fontSize: 13, lineHeight: 18, fontFamily: fontFamilies.bodyBold },
    actions: { flexDirection: "row", gap: 10, marginTop: 4 },
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
    danger: {
      minHeight: 46,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.dangerSoft,
    },
    dangerText: { color: warm.danger, fontSize: 15, fontFamily: fontFamilies.bodyBold },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.85 },
  });
