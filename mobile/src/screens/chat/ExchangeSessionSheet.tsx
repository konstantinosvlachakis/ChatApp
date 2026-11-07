import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  DEFAULT_EXCHANGE_DURATION,
  EXCHANGE_DURATIONS,
  EXCHANGE_TOPIC_MAX,
  chooseLanguage,
  defaultLanguagePair,
  exchangeErrorText,
  exchangeLanguageLabel,
} from "../../features/exchangeSession";
import { EMAIL_UNVERIFIED_CODE } from "../../features/emailVerification";
import { toApiError } from "../../services/api/errors";
import type { StartExchangeSessionInput } from "../../services/api/exchangeSessions";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";
import { KeyboardSheet } from "./KeyboardSheet";
import type { ExchangeSessionOptions } from "./useExchangeSession";

type ExchangeSessionSheetProps = {
  warm: WarmColors;
  reduceMotion: boolean;
  visible: boolean;
  partnerName: string;
  options: ExchangeSessionOptions | null;
  optionsLoading: boolean;
  onRetryOptions: () => void;
  onClose: () => void;
  /** Resolves when started (the sheet closes); throws to show the error inside the sheet. */
  onSubmit: (input: StartExchangeSessionInput) => Promise<void>;
};

/** "Guided exchange" start sheet: duration, language order (with swap), optional topic. */
export function ExchangeSessionSheet({
  warm,
  reduceMotion,
  visible,
  partnerName,
  options,
  optionsLoading,
  onRetryOptions,
  onClose,
  onSubmit,
}: ExchangeSessionSheetProps) {
  const styles = useMemo(() => createStyles(warm), [warm]);
  const durations = options?.durations?.length ? options.durations : EXCHANGE_DURATIONS;
  const languages = useMemo(
    () => Array.from(new Set((options?.languages || []).map((l) => l.toLowerCase()))),
    [options?.languages]
  );
  const [duration, setDuration] = useState(DEFAULT_EXCHANGE_DURATION);
  const [pair, setPair] = useState<[string, string] | null>(null);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Re-seed whenever the sheet opens (or the options arrive while it is open).
  const optionsKey = options ? `${languages.join(",")}|${options.defaultLanguages.join(",")}` : "";
  useEffect(() => {
    if (!visible) return;
    setDuration(durations.includes(DEFAULT_EXCHANGE_DURATION) ? DEFAULT_EXCHANGE_DURATION : durations[0]);
    setPair(options ? defaultLanguagePair(languages, options.defaultLanguages) : null);
    setTopic("");
    setError("");
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, optionsKey]);

  const canStart = Boolean(pair) && !busy;

  const handleStart = async () => {
    if (!pair || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({
        durationMinutes: duration,
        firstLanguage: pair[0],
        secondLanguage: pair[1],
        topic: topic.trim() || undefined,
      });
    } catch (caught) {
      const apiError = toApiError(caught);
      if (!apiError.isAborted && apiError.code !== EMAIL_UNVERIFIED_CODE) {
        setError(
          exchangeErrorText(apiError.code, apiError.code === "unknown" ? "Could not start the exchange." : apiError.message)
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const renderLanguageRow = (slot: 0 | 1, label: string) => (
    <View style={styles.section}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
        {languages.map((language) => {
          const selected = pair?.[slot] === language;
          const name = exchangeLanguageLabel(language);
          return (
            <Pressable
              key={language}
              style={({ pressed }) => [styles.pill, selected && styles.pillSelected, pressed && styles.pressed]}
              onPress={() => pair && setPair(chooseLanguage(pair, slot, language))}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: busy }}
              accessibilityLabel={`${label}: ${name}`}
            >
              <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <KeyboardSheet warm={warm} visible={visible} reduceMotion={reduceMotion} onClose={busy ? () => {} : onClose}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Guided exchange
        </Text>
        <Text style={styles.subtitle}>
          {partnerName ? `Practise with ${partnerName}: ` : ""}half the time in each language, with a topic to talk
          about.
        </Text>

        {!options ? (
          <View style={styles.loading}>
            {optionsLoading ? (
              <ActivityIndicator color={warm.teal} accessibilityLabel="Loading languages" />
            ) : (
              <Pressable
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                onPress={onRetryOptions}
                accessibilityRole="button"
                accessibilityLabel="Try loading the exchange options again"
              >
                <Text style={styles.secondaryText}>Try again</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.label}>How long?</Text>
              <View style={styles.pills} accessibilityRole="radiogroup">
                {durations.map((value) => {
                  const selected = value === duration;
                  return (
                    <Pressable
                      key={value}
                      style={({ pressed }) => [
                        styles.pill,
                        styles.durationPill,
                        selected && styles.pillSelected,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => setDuration(value)}
                      disabled={busy}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: busy }}
                      accessibilityLabel={`${value} minutes`}
                    >
                      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{value} min</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {pair ? (
              <>
                <View style={styles.order}>
                  <View style={styles.orderItem}>
                    <Text style={styles.orderStep}>First half</Text>
                    <Text style={styles.orderLanguage}>{exchangeLanguageLabel(pair[0])}</Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.swap, pressed && styles.pressed]}
                    onPress={() => setPair([pair[1], pair[0]])}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`Swap languages: start with ${exchangeLanguageLabel(pair[1])}`}
                    hitSlop={6}
                  >
                    <Ionicons name="swap-horizontal" size={20} color={warm.ink} />
                  </Pressable>
                  <View style={styles.orderItem}>
                    <Text style={styles.orderStep}>Second half</Text>
                    <Text style={styles.orderLanguage}>{exchangeLanguageLabel(pair[1])}</Text>
                  </View>
                </View>
                {languages.length > 2 ? (
                  <>
                    {renderLanguageRow(0, "Start in")}
                    {renderLanguageRow(1, "Then switch to")}
                  </>
                ) : null}
              </>
            ) : (
              <Text style={styles.note}>
                You need two different languages between you. Add the languages you speak or learn in your profile.
              </Text>
            )}

            <View style={styles.section}>
              <View style={styles.topicHeader}>
                <Text style={styles.label}>Topic (optional)</Text>
                <Text style={styles.counter}>
                  {topic.length}/{EXCHANGE_TOPIC_MAX}
                </Text>
              </View>
              <TextInput
                style={styles.input}
                value={topic}
                onChangeText={setTopic}
                maxLength={EXCHANGE_TOPIC_MAX}
                editable={!busy}
                placeholder="Leave empty and Lumi suggests topics"
                placeholderTextColor={warm.mutedInk}
                accessibilityLabel="Topic, optional. Leave empty for suggested topics"
                returnKeyType="done"
              />
            </View>

            {busy ? (
              <Text style={styles.note} accessibilityLiveRegion="polite">
                {topic.trim() ? "Sending the invite…" : "Lumi is preparing topics…"}
              </Text>
            ) : null}
            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
          </>
        )}

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.secondary, styles.flex, busy && styles.disabled, pressed && styles.pressed]}
            onPress={onClose}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.primary, !canStart && styles.disabled, pressed && styles.pressed]}
            onPress={handleStart}
            disabled={!canStart}
            accessibilityRole="button"
            accessibilityLabel={partnerName ? `Start and invite ${partnerName}` : "Start the exchange"}
            accessibilityState={{ disabled: !canStart, busy }}
          >
            {busy ? <ActivityIndicator color={warm.onNavy} /> : <Text style={styles.primaryText}>Start</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardSheet>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    content: { gap: 12, paddingBottom: 4 },
    flex: { flex: 1 },
    title: { color: warm.ink, fontSize: 20, fontFamily: fontFamilies.displayBold, textAlign: "center" },
    subtitle: {
      color: warm.mutedInk,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "center",
      fontFamily: fontFamilies.bodyMedium,
    },
    loading: { minHeight: 80, alignItems: "center", justifyContent: "center" },
    section: { gap: 6 },
    label: { color: warm.inkSoft, fontSize: 12, fontFamily: fontFamilies.bodyExtraBold },
    pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    pill: {
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.paper,
      alignItems: "center",
      justifyContent: "center",
    },
    durationPill: { flex: 1 },
    pillSelected: { backgroundColor: warm.navy, borderColor: warm.navy },
    pillText: { color: warm.ink, fontSize: 14, fontFamily: fontFamilies.bodyBold },
    pillTextSelected: { color: warm.onNavy },
    order: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 18,
      backgroundColor: warm.cream,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      padding: 10,
    },
    orderItem: { flex: 1, alignItems: "center", gap: 2 },
    orderStep: { color: warm.mutedInk, fontSize: 12, fontFamily: fontFamilies.bodySemiBold },
    orderLanguage: { color: warm.ink, fontSize: 16, fontFamily: fontFamilies.bodyExtraBold },
    swap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.paper,
      borderWidth: 1,
      borderColor: warm.line,
    },
    topicHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    counter: { color: warm.mutedInk, fontSize: 12, fontFamily: fontFamilies.bodySemiBold },
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
    note: { color: warm.mutedInk, fontSize: 13, lineHeight: 18, fontFamily: fontFamilies.bodyMedium },
    error: { color: warm.danger, fontSize: 13, lineHeight: 18, fontFamily: fontFamilies.bodyBold },
    actions: { flexDirection: "row", gap: 10, marginTop: 4 },
    secondary: {
      minHeight: 46,
      paddingHorizontal: 18,
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
