import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { describeWordDiff, diffWords } from "../../features/wordDiff";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";
import type { ChatMessage, MessageCorrection } from "../../types";
import { CorrectionDiffText } from "./CorrectionDiffText";

type CorrectionCardsProps = {
  message: ChatMessage;
  currentUserId?: number;
  isMine: boolean;
  warm: WarmColors;
  // Stable handlers (MessageRow is memoized).
  onSave: (message: ChatMessage, correction: MessageCorrection) => void;
  onEdit: (message: ChatMessage) => void;
  onRemove: (message: ChatMessage) => void;
};

/** Compact cards under a bubble, one per correction (oldest first). */
export function CorrectionCards({ message, currentUserId, isMine, warm, onSave, onEdit, onRemove }: CorrectionCardsProps) {
  const styles = useMemo(() => createStyles(warm), [warm]);
  const corrections = message.corrections || [];
  if (!corrections.length) return null;
  return (
    <View style={[styles.stack, isMine ? styles.stackMine : styles.stackOther]}>
      {corrections.map((correction) => (
        <CorrectionCard
          key={correction.id}
          message={message}
          correction={correction}
          isMyCorrection={correction.corrector?.id === currentUserId}
          warm={warm}
          styles={styles}
          onSave={onSave}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      ))}
    </View>
  );
}

type CardProps = {
  message: ChatMessage;
  correction: MessageCorrection;
  isMyCorrection: boolean;
  warm: WarmColors;
  styles: ReturnType<typeof createStyles>;
  onSave: CorrectionCardsProps["onSave"];
  onEdit: CorrectionCardsProps["onEdit"];
  onRemove: CorrectionCardsProps["onRemove"];
};

function CorrectionCard({ message, correction, isMyCorrection, warm, styles, onSave, onEdit, onRemove }: CardProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const original = message.text || "";
  const segments = useMemo(() => diffWords(original, correction.corrected_text), [correction.corrected_text, original]);
  const who = isMyCorrection ? "You" : correction.corrector?.username || "Someone";
  const note = (correction.note || "").trim();
  const changes = describeWordDiff(segments);
  const summary = `${who} suggested: ${correction.corrected_text}.${changes ? ` Changes: ${changes}.` : ""}${
    note ? ` Note: ${note}` : ""
  }`;

  return (
    <View style={styles.card}>
      <View accessible accessibilityLabel={summary}>
        <Text style={styles.header} importantForAccessibility="no">
          ✎ {who} suggested
        </Text>
        <CorrectionDiffText original={original} corrected={correction.corrected_text} segments={segments} warm={warm} />
      </View>
      {note ? (
        <Pressable
          onPress={() => setNoteOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: noteOpen }}
          accessibilityLabel={noteOpen ? "Hide the note" : "Show the whole note"}
          hitSlop={4}
        >
          <Text style={styles.note} numberOfLines={noteOpen ? undefined : 1}>
            <Text style={styles.noteLabel}>Why: </Text>
            {note}
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          onPress={() => onSave(message, correction)}
          accessibilityRole="button"
          accessibilityLabel="Save this correction to your phrasebook"
          hitSlop={6}
        >
          <Ionicons name="bookmark-outline" size={14} color={warm.teal} />
          <Text style={styles.actionText}>Save</Text>
        </Pressable>
        {isMyCorrection ? (
          <>
            <Pressable
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              onPress={() => onEdit(message)}
              accessibilityRole="button"
              accessibilityLabel="Edit your correction"
              hitSlop={6}
            >
              <Ionicons name="create-outline" size={14} color={warm.inkSoft} />
              <Text style={[styles.actionText, styles.actionTextMuted]}>Edit</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              onPress={() => onRemove(message)}
              accessibilityRole="button"
              accessibilityLabel="Remove your correction"
              hitSlop={6}
            >
              <Ionicons name="trash-outline" size={14} color={warm.danger} />
              <Text style={[styles.actionText, styles.actionTextDanger]}>Remove</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    stack: {
      marginTop: 4,
      gap: 4,
      maxWidth: "100%",
    },
    stackMine: { alignItems: "flex-end" },
    stackOther: { alignItems: "flex-start" },
    card: {
      maxWidth: "100%",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      backgroundColor: warm.paper,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 4,
    },
    header: {
      color: warm.peachInk,
      fontSize: 12,
      fontFamily: fontFamilies.bodyExtraBold,
      marginBottom: 2,
    },
    note: {
      color: warm.inkSoft,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fontFamilies.bodyMedium,
    },
    noteLabel: {
      fontFamily: fontFamilies.bodyBold,
    },
    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 14,
      marginTop: 2,
    },
    action: {
      minHeight: 28,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    pressed: { opacity: 0.6 },
    actionText: {
      color: warm.teal,
      fontSize: 12,
      fontFamily: fontFamilies.bodyBold,
    },
    actionTextMuted: { color: warm.inkSoft },
    actionTextDanger: { color: warm.danger },
  });
