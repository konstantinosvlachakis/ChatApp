import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Alert, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  canSwitchNow,
  closedSessionNote,
  correctionsLine,
  currentLanguageAt,
  endedReason,
  exchangeLanguageLabel,
  formatCountdown,
  formatMinutes,
  isHalfwayNudgeDue,
  isOpenSession,
  isPastDeadline,
  languageBalance,
  messagesPerPerson,
  remainingMs,
  sessionPartnerName,
  sessionPlanLine,
  sessionProgress,
  sessionRole,
  spokenCountdown,
  switchFraction,
} from "../../features/exchangeSession";
import { hapticSelection } from "../../services/haptics";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";
import type { ExchangeSession, ExchangeSessionAction } from "../../types";

// Sessions whose halfway nudge was already shown (once per app run, across remounts).
const nudgedSessionIds = new Set<number>();
const NUDGE_VISIBLE_MS = 15_000;

type ExchangeSessionBannerProps = {
  warm: WarmColors;
  session: ExchangeSession;
  offsetMs: number;
  currentUserId: number | undefined;
  /** Chat not on screen: stop ticking. */
  paused: boolean;
  busyAction: ExchangeSessionAction | null;
  onAction: (action: ExchangeSessionAction) => void;
  /** The local timer reached ends_at / expires_at (refetch; never ends the session itself). */
  onDeadline: (session: ExchangeSession) => void;
  onDismiss: () => void;
  onStartAnother: () => void;
};

/**
 * Guided exchange banner at the top of a direct chat: pending invite, running session (timer,
 * current language, progress with the switch point, topic, switch/end), end card, or a short note
 * for a declined/cancelled/expired invite. Collapsible to a slim bar. No animations.
 */
export function ExchangeSessionBanner({
  warm,
  session,
  offsetMs,
  currentUserId,
  paused,
  busyAction,
  onAction,
  onDeadline,
  onDismiss,
  onStartAnother,
}: ExchangeSessionBannerProps) {
  const styles = useMemo(() => createStyles(warm), [warm]);
  const [now, setNow] = useState(() => Date.now());
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const [collapsed, setCollapsed] = useState(false);
  const [nudgeVisible, setNudgeVisible] = useState(false);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = isOpenSession(session);
  const ticking = open && !paused && appActive;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setAppActive(state === "active"));
    return () => subscription.remove();
  }, []);

  // One tick per second while the session is open and on screen.
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [ticking]);

  // Re-read the clock when a new snapshot arrives (status/timestamps/offset changed).
  useEffect(() => {
    setNow(Date.now());
  }, [session, offsetMs]);

  useEffect(() => {
    if (ticking && isPastDeadline(session, offsetMs, now)) onDeadline(session);
  }, [now, offsetMs, onDeadline, session, ticking]);

  const secondLabel = exchangeLanguageLabel(session.second_language);
  useEffect(() => {
    if (!ticking || nudgedSessionIds.has(session.id)) return;
    if (!isHalfwayNudgeDue(session, offsetMs, now)) return;
    nudgedSessionIds.add(session.id);
    setNudgeVisible(true);
    hapticSelection();
    AccessibilityInfo.announceForAccessibility(`Halfway. Time to switch to ${secondLabel}.`);
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
    nudgeTimerRef.current = setTimeout(() => setNudgeVisible(false), NUDGE_VISIBLE_MS);
  }, [now, offsetMs, secondLabel, session, ticking]);

  useEffect(() => {
    setNudgeVisible(false);
    return () => {
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
    };
  }, [session.id]);

  // Status changes are announced once (accepted, declined, ended…).
  const lastStatusRef = useRef(session.status);
  useEffect(() => {
    if (lastStatusRef.current === session.status) return;
    lastStatusRef.current = session.status;
    const message =
      session.status === "active"
        ? `Exchange started. Now speaking ${exchangeLanguageLabel(session.first_language)}.`
        : session.status === "ended"
          ? "Exchange ended."
          : closedSessionNote(session, currentUserId);
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [currentUserId, session]);

  const role = sessionRole(session, currentUserId);
  const partner = sessionPartnerName(session, currentUserId) || "Your partner";
  const remaining = remainingMs(session, offsetMs, now);
  const countdown = formatCountdown(remaining);
  const spokenLeft = spokenCountdown(remaining);
  const currentLanguage = exchangeLanguageLabel(currentLanguageAt(session, offsetMs, now));
  const busy = Boolean(busyAction);

  const confirmEnd = () => {
    Alert.alert("End the exchange?", "You'll both see the summary.", [
      { text: "Keep going", style: "cancel" },
      { text: "End", style: "destructive", onPress: () => onAction("end") },
    ]);
  };

  const actionButton = (
    action: ExchangeSessionAction,
    label: string,
    variant: "primary" | "secondary" | "danger",
    onPress: () => void = () => onAction(action),
    accessibilityLabel = label
  ) => (
    <Pressable
      key={action + label}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "danger" && styles.buttonDanger,
        busy && busyAction !== action && styles.disabled,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: busy, busy: busyAction === action }}
    >
      {busyAction === action ? (
        <ActivityIndicator size="small" color={variant === "primary" ? warm.onNavy : warm.ink} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === "primary" && styles.buttonTextPrimary,
            variant === "danger" && styles.buttonTextDanger,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );

  // Declined / cancelled / expired: one dismissible line.
  if (!open && session.status !== "ended") {
    return (
      <View style={[styles.container, styles.noteRow]}>
        <Ionicons name="information-circle-outline" size={18} color={warm.mutedInk} />
        <Text style={styles.noteText}>{closedSessionNote(session, currentUserId)}</Text>
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={6}
        >
          <Ionicons name="close" size={18} color={warm.inkSoft} />
        </Pressable>
      </View>
    );
  }

  const slimText =
    session.status === "pending"
      ? role === "partner"
        ? `${partner} invited you to an exchange`
        : `Waiting for ${partner} · ${countdown}`
      : session.status === "active"
        ? `Now: ${currentLanguage} · ${countdown} left`
        : `Exchange summary · ${formatMinutes(session.summary?.total_minutes)} min`;
  const slimSpoken =
    session.status === "active"
      ? `Guided exchange. Now speaking ${currentLanguage}. ${spokenLeft} left.`
      : session.status === "pending"
        ? role === "partner"
          ? `${partner} invited you to a guided exchange.`
          : `Guided exchange invite. Waiting for ${partner}, ${spokenLeft} left.`
        : "Guided exchange summary.";

  if (collapsed) {
    return (
      <Pressable
        style={({ pressed }) => [styles.container, styles.slim, pressed && styles.pressed]}
        onPress={() => setCollapsed(false)}
        accessibilityRole="button"
        accessibilityLabel={`${slimSpoken} Expand`}
      >
        <Ionicons name="timer-outline" size={18} color={warm.teal} />
        <Text style={styles.slimText} numberOfLines={1}>
          {slimText}
        </Text>
        {nudgeVisible ? (
          <Text style={styles.slimNudge} numberOfLines={1}>
            Switch!
          </Text>
        ) : null}
        <Ionicons name="chevron-down" size={18} color={warm.inkSoft} />
      </Pressable>
    );
  }

  const header = (title: string, right?: React.ReactNode) => (
    <View style={styles.headerRow}>
      <Ionicons name="timer-outline" size={18} color={warm.teal} />
      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      {right}
      <Pressable
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        onPress={() => setCollapsed(true)}
        accessibilityRole="button"
        accessibilityLabel="Collapse the exchange panel"
        hitSlop={6}
      >
        <Ionicons name="chevron-up" size={18} color={warm.inkSoft} />
      </Pressable>
    </View>
  );

  if (session.status === "pending") {
    return (
      <View style={styles.container}>
        {header(
          "Guided exchange",
          <Text style={styles.timer} accessibilityLabel={`Invite expires in ${spokenLeft}`}>
            {countdown}
          </Text>
        )}
        <Text style={styles.body}>
          {role === "partner"
            ? `${partner} invited you to a ${sessionPlanLine(session)}.`
            : `Waiting for ${partner} to accept. ${sessionPlanLine(session)}.`}
        </Text>
        {session.topic?.title ? <Text style={styles.meta}>Topic: {session.topic.title}</Text> : null}
        <View style={styles.actionsRow}>
          {role === "partner"
            ? [
                actionButton("decline", "Decline", "secondary", undefined, "Decline the exchange invite"),
                actionButton("accept", "Accept", "primary", undefined, "Accept and start the exchange"),
              ]
            : role === "starter"
              ? [actionButton("cancel", "Cancel invite", "secondary")]
              : null}
        </View>
      </View>
    );
  }

  if (session.status === "active") {
    const progress = sessionProgress(session, offsetMs, now);
    const markAt = switchFraction(session);
    const canSwitch = canSwitchNow(session, offsetMs, now);
    const prompts = session.topic?.prompts || [];
    return (
      <View style={styles.container}>
        {header(
          "Guided exchange",
          <Text style={styles.timer} accessibilityLabel={`${spokenLeft} left`}>
            {countdown}
          </Text>
        )}
        <View style={styles.chipRow}>
          <View style={styles.chip} accessibilityLabel={`Now speaking ${currentLanguage}`} accessible>
            <Text style={styles.chipText}>Now: {currentLanguage}</Text>
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {exchangeLanguageLabel(session.first_language)} → {secondLabel}
          </Text>
        </View>
        <View
          style={styles.track}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Exchange progress"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
        >
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          <View style={[styles.mark, { left: `${markAt * 100}%` }]} />
        </View>

        {nudgeVisible ? (
          <View style={styles.nudge} accessibilityLiveRegion="polite">
            <Ionicons name="swap-horizontal" size={16} color={warm.peachInk} />
            <Text style={styles.nudgeText}>Time to switch to {secondLabel}</Text>
            <Pressable
              onPress={() => setNudgeVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss the switch reminder"
              hitSlop={8}
            >
              <Ionicons name="close" size={16} color={warm.peachInk} />
            </Pressable>
          </View>
        ) : null}

        {session.topic ? (
          <View style={styles.topic}>
            <Text style={styles.topicLabel}>Topic</Text>
            <Text style={styles.topicTitle}>{session.topic.title}</Text>
            {prompts.map((prompt, index) => (
              <Text key={`${index}-${prompt}`} style={styles.prompt}>
                • {prompt}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          {actionButton("topic", "Another topic", "secondary", undefined, "Suggest another topic")}
          {canSwitch
            ? actionButton("switch", `Switch to ${secondLabel}`, "secondary", undefined, `Switch to ${secondLabel} now`)
            : null}
          {actionButton("end", "End", "danger", confirmEnd, "End the exchange")}
        </View>
      </View>
    );
  }

  // Ended: summary card.
  const summary = session.summary;
  const balance = languageBalance(summary);
  const people = messagesPerPerson(session, currentUserId);
  return (
    <View style={styles.container}>
      {header(
        "Exchange complete",
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss the exchange summary"
          hitSlop={6}
        >
          <Ionicons name="close" size={18} color={warm.inkSoft} />
        </Pressable>
      )}
      <Text style={styles.body}>
        {endedReason(session, currentUserId)}
        {summary ? ` · ${formatMinutes(summary.total_minutes)} min together` : ""}
      </Text>
      {balance.length === 2 ? (
        <>
          <View
            style={styles.balance}
            accessible
            accessibilityLabel={`Language balance: ${balance
              .map((segment) => `${segment.label} ${formatMinutes(segment.minutes)} minutes`)
              .join(", ")}`}
          >
            {balance.every((segment) => segment.fraction === 0) ? (
              <View style={[styles.balanceSegment, styles.balanceEmpty]} />
            ) : (
              balance.map((segment, index) =>
                segment.fraction > 0 ? (
                  <View
                    key={segment.language}
                    style={[
                      styles.balanceSegment,
                      index === 0 ? styles.balanceFirst : styles.balanceSecond,
                      { flex: segment.fraction },
                    ]}
                  />
                ) : null
              )
            )}
          </View>
          <View style={styles.balanceLabels} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {balance.map((segment, index) => (
              <View key={segment.language} style={styles.balanceLabel}>
                <View style={[styles.legendDot, index === 0 ? styles.balanceFirst : styles.balanceSecond]} />
                <Text style={styles.meta}>
                  {segment.label} {formatMinutes(segment.minutes)} min
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {people.length && balance.length ? (
        <View style={styles.people}>
          {people.map((person) => (
            <Text key={person.userId} style={styles.personRow}>
              <Text style={styles.personName}>{person.name}: </Text>
              {person.counts.map((c) => `${c.count} in ${c.label}`).join(", ")}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.meta}>{correctionsLine(summary)}</Text>
      <View style={styles.actionsRow}>
        <Pressable
          style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && styles.pressed]}
          onPress={onStartAnother}
          accessibilityRole="button"
          accessibilityLabel="Start another guided exchange"
        >
          <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Start another</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    container: {
      marginHorizontal: 12,
      marginTop: 6,
      marginBottom: 2,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      backgroundColor: warm.peachSoft,
      gap: 8,
    },
    slim: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, minHeight: 44 },
    slimText: { flex: 1, color: warm.ink, fontSize: 13, fontFamily: fontFamilies.bodyBold },
    slimNudge: { color: warm.peachInk, fontSize: 12, fontFamily: fontFamilies.bodyExtraBold },
    noteRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
    noteText: { flex: 1, color: warm.inkSoft, fontSize: 13, lineHeight: 18, fontFamily: fontFamilies.bodySemiBold },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    title: { flex: 1, color: warm.ink, fontSize: 15, fontFamily: fontFamilies.displaySemiBold },
    timer: { color: warm.ink, fontSize: 16, fontFamily: fontFamilies.bodyExtraBold, fontVariant: ["tabular-nums"] },
    iconButton: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    body: { color: warm.ink, fontSize: 14, lineHeight: 20, fontFamily: fontFamilies.bodyMedium },
    meta: { color: warm.inkSoft, fontSize: 12, lineHeight: 17, fontFamily: fontFamilies.bodySemiBold },
    chipRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    chip: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: warm.navy,
    },
    chipText: { color: warm.onNavy, fontSize: 12, fontFamily: fontFamilies.bodyExtraBold },
    track: {
      height: 8,
      borderRadius: 999,
      backgroundColor: warm.creamDeep,
      overflow: "visible",
      justifyContent: "center",
    },
    fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 999, backgroundColor: warm.teal },
    mark: {
      position: "absolute",
      top: -3,
      width: 3,
      height: 14,
      marginLeft: -1.5,
      borderRadius: 2,
      backgroundColor: warm.peachInk,
    },
    nudge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: warm.peach,
    },
    nudgeText: { flex: 1, color: warm.peachInk, fontSize: 13, fontFamily: fontFamilies.bodyExtraBold },
    topic: {
      borderRadius: 14,
      backgroundColor: warm.paper,
      borderWidth: 1,
      borderColor: warm.line,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 2,
    },
    topicLabel: { color: warm.mutedInk, fontSize: 12, fontFamily: fontFamilies.bodyExtraBold },
    topicTitle: { color: warm.ink, fontSize: 14, lineHeight: 19, fontFamily: fontFamilies.bodyBold },
    prompt: { color: warm.inkSoft, fontSize: 13, lineHeight: 18, fontFamily: fontFamilies.bodyMedium },
    actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    button: {
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.paper,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonPrimary: { backgroundColor: warm.navy, borderColor: warm.navy },
    buttonDanger: { backgroundColor: warm.dangerSoft, borderColor: warm.dangerSoft },
    buttonText: { color: warm.ink, fontSize: 13, fontFamily: fontFamilies.bodyBold },
    buttonTextPrimary: { color: warm.onNavy },
    buttonTextDanger: { color: warm.danger },
    balance: {
      flexDirection: "row",
      height: 12,
      borderRadius: 999,
      overflow: "hidden",
      backgroundColor: warm.creamDeep,
      gap: 2,
    },
    balanceSegment: { height: "100%" },
    balanceEmpty: { flex: 1, backgroundColor: warm.creamDeep },
    balanceFirst: { backgroundColor: warm.teal },
    balanceSecond: { backgroundColor: warm.peachInk },
    balanceLabels: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    balanceLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    people: { gap: 2 },
    personRow: { color: warm.inkSoft, fontSize: 13, lineHeight: 18, fontFamily: fontFamilies.bodyMedium },
    personName: { color: warm.ink, fontFamily: fontFamilies.bodyBold },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.85 },
  });
