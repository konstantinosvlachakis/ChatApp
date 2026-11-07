import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { formatRelativeDue, languageLabel, reviewPrompt } from "../features/corrections";
import { fetchPhrasebookReview, submitPhraseReview } from "../services/api/phrasebook";
import { getErrorMessage } from "../services/api/errors";
import { hapticLight, hapticSuccess } from "../services/haptics";
import { toastApiError } from "../services/toast";
import { fontFamilies } from "../theme/typography";
import { warmColors, type WarmColors } from "../theme/warm";
import type { PhrasebookEntry, PhrasebookReviewResult } from "../types";

const GRADES: Array<{ result: PhrasebookReviewResult; label: string; hint: string }> = [
  { result: "again", label: "Again", hint: "I didn't remember it" },
  { result: "hard", label: "Hard", hint: "Remembered with effort" },
  { result: "good", label: "Good", hint: "Remembered it" },
  { result: "easy", label: "Easy", hint: "Knew it instantly" },
];

type Phase = "loading" | "error" | "review" | "done";

// Root stack route `PhrasebookReview`: one due card at a time (front = meaning/context/note,
// "Show answer" reveals the phrase), graded Again/Hard/Good/Easy. Batches of up to 20 cards.
export function PhrasebookReviewScreen() {
  const navigation = useNavigation<any>();
  const { isDark } = useTheme();
  const warm = warmColors(isDark);
  const styles = useMemo(() => createStyles(warm), [warm]);

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [cards, setCards] = useState<PhrasebookEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState<PhrasebookReviewResult | null>(null);
  const [reviewedCount, setReviewedCount] = useState(0);
  // After a batch: what is due now (another batch) and when the next card comes due.
  const [remainingDue, setRemainingDue] = useState(0);
  const [nextDueAt, setNextDueAt] = useState<string | null>(null);
  const [nextBatch, setNextBatch] = useState<PhrasebookEntry[]>([]);
  const [checkingNext, setCheckingNext] = useState(false);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  const loadBatch = useCallback(async () => {
    setPhase("loading");
    setError("");
    try {
      const batch = await fetchPhrasebookReview();
      if (!mountedRef.current) return;
      setCards(batch.cards || []);
      setIndex(0);
      setRevealed(false);
      setNextDueAt(batch.next_due_at);
      setRemainingDue(batch.due_count || 0);
      setPhase(batch.cards?.length ? "review" : "done");
    } catch (caught) {
      if (!mountedRef.current) return;
      setError(getErrorMessage(caught, "Could not load your review."));
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    loadBatch();
  }, [loadBatch]);

  // End of a batch: refetch to see whether more cards are due and when the next one is.
  const finishBatch = useCallback(async (dueAfter: number) => {
    setPhase("done");
    setRemainingDue(dueAfter);
    setNextBatch([]);
    setCheckingNext(true);
    try {
      const batch = await fetchPhrasebookReview();
      if (!mountedRef.current) return;
      setNextBatch(batch.cards || []);
      setRemainingDue(batch.due_count || 0);
      setNextDueAt(batch.next_due_at);
    } catch {
      // Keep the counts from the last review response.
    } finally {
      if (mountedRef.current) setCheckingNext(false);
    }
  }, []);

  const card = phase === "review" ? cards[index] : undefined;
  const prompt = card ? reviewPrompt(card) : null;

  const grade = async (result: PhrasebookReviewResult) => {
    if (!card || submitting) return;
    setSubmitting(result);
    try {
      const response = await submitPhraseReview(card.id, result);
      if (!mountedRef.current) return;
      hapticLight();
      setReviewedCount((count) => count + 1);
      if (index + 1 < cards.length) {
        setIndex(index + 1);
        setRevealed(false);
      } else {
        hapticSuccess();
        finishBatch(response.due_count || 0);
      }
    } catch (caught) {
      toastApiError(caught, "Could not save this review. Try again.", "Not saved");
    } finally {
      if (mountedRef.current) setSubmitting(null);
    }
  };

  const continueReview = () => {
    if (!nextBatch.length) return;
    setCards(nextBatch);
    setNextBatch([]);
    setIndex(0);
    setRevealed(false);
    setPhase("review");
  };

  const total = cards.length;
  const progress = total ? (index + (phase === "done" ? 1 : 0)) / total : 0;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Close review"
          hitSlop={6}
        >
          <Ionicons name="close" size={22} color={warm.ink} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Review
        </Text>
        {phase === "review" ? (
          <Text style={styles.counter} accessibilityLabel={`Card ${index + 1} of ${total}`}>
            {index + 1} / {total}
          </Text>
        ) : (
          <View style={styles.iconButton} />
        )}
      </View>
      {phase === "review" ? (
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: total, now: index }}
        >
          <View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      ) : null}

      {phase === "loading" ? (
        <View style={styles.center}>
          <ActivityIndicator color={warm.teal} accessibilityLabel="Loading review" />
        </View>
      ) : null}

      {phase === "error" ? (
        <View style={styles.center}>
          <Text style={styles.message}>{error}</Text>
          <Pressable style={styles.secondaryButton} onPress={loadBatch} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {card && prompt ? (
        <>
          <ScrollView contentContainerStyle={styles.cardScroll}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.promptLabel}>{prompt.label}</Text>
                {card.language && prompt.kind !== "recall" ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{languageLabel(card.language)}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.promptText, prompt.kind === "recall" && styles.promptRecall]}>{prompt.text}</Text>

              {revealed ? (
                <View style={styles.answer} accessibilityLiveRegion="polite">
                  <View style={styles.divider} />
                  <Text style={styles.answerLabel}>Phrase</Text>
                  <Text style={styles.answerText} selectable>
                    {card.text}
                  </Text>
                  {card.meaning && prompt.kind !== "meaning" ? (
                    <Text style={styles.detail}>{card.meaning}</Text>
                  ) : null}
                  {card.context && prompt.kind !== "context" ? (
                    <Text style={[styles.detail, styles.detailItalic]}>“{card.context}”</Text>
                  ) : null}
                  {card.note && prompt.kind !== "note" ? (
                    <Text style={styles.detail}>
                      <Text style={styles.detailLabel}>Note: </Text>
                      {card.note}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {revealed ? (
              <View style={styles.grades}>
                {GRADES.map((item) => (
                  <Pressable
                    key={item.result}
                    style={({ pressed }) => [
                      styles.grade,
                      item.result === "again" && styles.gradeAgain,
                      item.result === "good" && styles.gradeGood,
                      Boolean(submitting) && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => grade(item.result)}
                    disabled={Boolean(submitting)}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityHint={item.hint}
                    accessibilityState={{ disabled: Boolean(submitting), busy: submitting === item.result }}
                  >
                    {submitting === item.result ? (
                      <ActivityIndicator color={item.result === "good" ? warm.onAction : warm.ink} />
                    ) : (
                      <Text
                        style={[
                          styles.gradeText,
                          item.result === "again" && styles.gradeAgainText,
                          item.result === "good" && styles.gradeGoodText,
                        ]}
                      >
                        {item.label}
                      </Text>
                    )}
                  </Pressable>
                ))}
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                onPress={() => setRevealed(true)}
                accessibilityRole="button"
                accessibilityLabel="Show answer"
              >
                <Text style={styles.primaryButtonText}>Show answer</Text>
              </Pressable>
            )}
          </View>
        </>
      ) : null}

      {phase === "done" ? (
        <View style={styles.center}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark-done" size={28} color={warm.teal} />
          </View>
          <Text style={styles.doneTitle} accessibilityRole="header">
            {reviewedCount ? "Nice work!" : "Nothing to review"}
          </Text>
          <Text style={styles.message}>
            {reviewedCount
              ? `You reviewed ${reviewedCount} ${reviewedCount === 1 ? "phrase" : "phrases"}.`
              : "No phrases are due right now."}
          </Text>
          {checkingNext ? (
            <ActivityIndicator color={warm.teal} accessibilityLabel="Checking for more cards" />
          ) : nextBatch.length ? (
            <Pressable
              style={({ pressed }) => [styles.primaryButton, styles.doneButton, pressed && styles.pressed]}
              onPress={continueReview}
              accessibilityRole="button"
              accessibilityLabel={`Keep going, ${remainingDue} due`}
            >
              <Text style={styles.primaryButtonText}>Keep going · {remainingDue} due</Text>
            </Pressable>
          ) : nextDueAt ? (
            <Text style={styles.message}>Next review {formatRelativeDue(nextDueAt)}.</Text>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, styles.doneButton, pressed && styles.pressed]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Back to phrasebook</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: warm.cream },
    topBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
    iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    title: { flex: 1, color: warm.ink, fontSize: 22, fontFamily: fontFamilies.displayBold, textAlign: "center" },
    counter: {
      minWidth: 44,
      textAlign: "right",
      color: warm.inkSoft,
      fontSize: 15,
      fontFamily: fontFamilies.bodyBold,
      paddingRight: 4,
    },
    track: { height: 6, marginHorizontal: 16, borderRadius: 999, backgroundColor: warm.creamDeep, overflow: "hidden" },
    trackFill: { height: "100%", borderRadius: 999, backgroundColor: warm.teal },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 },
    message: { color: warm.mutedInk, fontSize: 15, lineHeight: 21, textAlign: "center", fontFamily: fontFamilies.bodySemiBold },
    cardScroll: { flexGrow: 1, justifyContent: "center", padding: 16 },
    card: {
      borderRadius: 28,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      backgroundColor: warm.paper,
      padding: 22,
      gap: 10,
      shadowColor: warm.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    promptLabel: {
      color: warm.peachInk,
      fontSize: 12,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      fontFamily: fontFamilies.bodyExtraBold,
    },
    badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: warm.sage },
    badgeText: { color: warm.teal, fontSize: 12, fontFamily: fontFamilies.bodyBold },
    promptText: { color: warm.ink, fontSize: 22, lineHeight: 30, fontFamily: fontFamilies.displaySemiBold },
    promptRecall: { color: warm.inkSoft },
    answer: { gap: 8 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: warm.line, marginVertical: 6 },
    answerLabel: { color: warm.teal, fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: fontFamilies.bodyExtraBold },
    answerText: { color: warm.ink, fontSize: 26, lineHeight: 34, fontFamily: fontFamilies.displayBold },
    detail: { color: warm.inkSoft, fontSize: 15, lineHeight: 21, fontFamily: fontFamilies.bodyMedium },
    detailItalic: { fontStyle: "italic" },
    detailLabel: { fontFamily: fontFamilies.bodyBold },
    footer: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 },
    grades: { flexDirection: "row", gap: 8 },
    grade: {
      flex: 1,
      minHeight: 52,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.secondary,
      alignItems: "center",
      justifyContent: "center",
    },
    gradeAgain: { backgroundColor: warm.dangerSoft, borderColor: warm.dangerSoft },
    gradeGood: { backgroundColor: warm.action, borderColor: warm.action },
    gradeText: { color: warm.ink, fontSize: 15, fontFamily: fontFamilies.bodyBold },
    gradeAgainText: { color: warm.danger },
    gradeGoodText: { color: warm.onAction },
    primaryButton: {
      minHeight: 52,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
      backgroundColor: warm.action,
    },
    primaryButtonText: { color: warm.onAction, fontSize: 16, fontFamily: fontFamilies.displaySemiBold },
    secondaryButton: {
      minHeight: 48,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.secondary,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    secondaryButtonText: { color: warm.ink, fontSize: 15, fontFamily: fontFamilies.bodyBold },
    doneIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.sage,
    },
    doneTitle: { color: warm.ink, fontSize: 24, fontFamily: fontFamilies.displayBold },
    doneButton: { alignSelf: "stretch" },
    disabled: { opacity: 0.6 },
    pressed: { opacity: 0.85 },
  });
