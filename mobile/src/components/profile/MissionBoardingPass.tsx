import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import CountryFlag from "react-native-country-flag";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { barcodeBars, boardLabel, passProgress, routeCode } from "../../features/boardingPass";
import { fontFamilies } from "../../theme/typography";
import { warmColors, type WarmColors } from "../../theme/warm";
import type { MissionStats } from "./useMissionStats";

type Level = "beginner" | "intermediate" | "advanced" | "fluent";

/** Level accent (seat code, route fill, gate title), checked against `paper` in both themes. */
const LEVEL_ACCENT: Record<Level, { light: string; dark: string }> = {
  beginner: { light: "#a94c26", dark: "#f5b58a" },
  intermediate: { light: "#176e65", dark: "#7fd3c6" },
  advanced: { light: "#2f6b2a", dark: "#a6dba0" },
  fluent: { light: "#5b45a8", dark: "#c3b3ff" },
};

type Endpoint = { language: string; isoCode?: string | null; flag?: string | null };

type MissionBoardingPassProps = {
  from: Endpoint;
  to: Endpoint;
  level: string;
  /** Self-reported CEFR code shown as the seat, e.g. "B1". */
  seat: string;
  /** Fun level title for the current level ("Conversation Surfer"). */
  gate: string;
  /** Next level's title, or null at the top. */
  next: string | null;
  stats?: MissionStats;
  onPractise: () => void;
  onBoard: () => void;
  onMenu: () => void;
  busy?: boolean;
  /** Colour behind the pass (the notches are cut-outs showing it). */
  backdrop: string;
};

function Flag({ endpoint, styles }: { endpoint: Endpoint; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.flag}>
      {endpoint.isoCode ? (
        <CountryFlag isoCode={endpoint.isoCode} size={14} />
      ) : (
        <Text style={styles.flagEmoji}>{endpoint.flag || "🌐"}</Text>
      )}
    </View>
  );
}

/**
 * A practising language as a LangVoyage boarding pass: from your native language to the one
 * you're learning, real practice progress as the flight route, CEFR level as the seat.
 */
export function MissionBoardingPass(props: MissionBoardingPassProps) {
  const { isDark } = useTheme();
  const warm = warmColors(isDark);
  const level = (props.level in LEVEL_ACCENT ? props.level : "beginner") as Level;
  const accent = LEVEL_ACCENT[level][isDark ? "dark" : "light"];
  const styles = useMemo(() => createStyles(warm, accent, props.backdrop), [warm, accent, props.backdrop]);
  const progress = passProgress(props.stats?.progress);
  const statsLoaded = props.stats !== undefined;
  const bars = useMemo(() => barcodeBars(`${props.to.language}${props.seat}`), [props.to.language, props.seat]);
  const toName = props.to.language;
  const routeLabel = progress
    ? `Practice route: ${progress.stage}, ${progress.caption}`
    : statsLoaded
      ? "Practice for this language is coming soon"
      : "Loading practice progress";

  return (
    <View style={styles.pass}>
      <View style={styles.header}>
        <Ionicons name="airplane" size={14} color={warm.onNavy} />
        <Text style={styles.headerText} numberOfLines={1}>
          LANGVOYAGE · BOARDING PASS
        </Text>
        <Pressable
          onPress={props.onMenu}
          hitSlop={6}
          style={({ pressed }) => [styles.menu, pressed && styles.menuPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Options for ${toName}`}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={warm.onNavy} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.main}>
          <View
            style={styles.route}
            accessible
            accessibilityLabel={`From ${props.from.language} to ${toName}. ${routeLabel}`}
          >
            <View style={styles.endpoint}>
              <Text style={styles.endpointLabel}>FROM</Text>
              <View style={styles.codeRow}>
                <Flag endpoint={props.from} styles={styles} />
                <Text style={styles.code}>{routeCode(props.from.language)}</Text>
              </View>
              <Text style={styles.endpointName} numberOfLines={1}>{props.from.language}</Text>
            </View>

            <View style={styles.flight}>
              <View style={styles.track}>
                <View style={[styles.trackFill, { width: `${Math.round((progress?.fraction ?? 0) * 100)}%` }]} />
                <View style={[styles.plane, { left: `${Math.round((progress?.fraction ?? 0) * 100)}%` }]}>
                  <MaterialCommunityIcons name="airplane" size={16} color={accent} />
                </View>
              </View>
            </View>

            <View style={[styles.endpoint, styles.endpointTo]}>
              <Text style={styles.endpointLabel}>TO</Text>
              <View style={styles.codeRow}>
                <Text style={styles.code}>{routeCode(toName)}</Text>
                <Flag endpoint={props.to} styles={styles} />
              </View>
              <Text style={styles.endpointName} numberOfLines={1}>{toName}</Text>
            </View>
          </View>
          <Text style={styles.routeCaption} numberOfLines={1}>
            {progress ? `${progress.stage} · ${progress.caption}` : statsLoaded ? "Practice coming soon" : " "}
          </Text>

          <View style={styles.fields}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>GATE</Text>
              <Text style={[styles.fieldValue, { color: accent }]} numberOfLines={1}>{props.gate}</Text>
            </View>
            {props.next ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>NEXT</Text>
                <View style={styles.nextRow}>
                  <Ionicons name="lock-closed" size={11} color={warm.mutedInk} />
                  <Text style={styles.fieldValueMuted} numberOfLines={1}>{props.next}</Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        {/* Perforation with notches, then the stub. */}
        <View style={styles.perforation} importantForAccessibility="no-hide-descendants">
          <View style={[styles.notch, styles.notchTop]} />
          <View style={styles.dots}>
            {Array.from({ length: 9 }, (_, index) => (
              <View key={index} style={styles.dot} />
            ))}
          </View>
          <View style={[styles.notch, styles.notchBottom]} />
        </View>

        <View style={styles.stub} accessible accessibilityLabel={`Level ${props.seat}`}>
          <Text style={styles.fieldLabel}>SEAT</Text>
          <Text style={[styles.seat, { color: accent }]} adjustsFontSizeToFit numberOfLines={1}>
            {props.seat}
          </Text>
          <View style={styles.barcode} importantForAccessibility="no-hide-descendants">
            {bars.map((width, index) => (
              <View key={index} style={[styles.bar, { width }]} />
            ))}
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={props.onPractise}
          style={({ pressed }) => [styles.button, styles.buttonSecondary, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Practise ${toName}`}
        >
          <Ionicons name="school-outline" size={16} color={warm.ink} />
          <Text style={styles.buttonSecondaryText}>Practise</Text>
        </Pressable>
        <Pressable
          onPress={props.onBoard}
          disabled={props.busy}
          style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={
            props.stats?.partners ? `Find partners: ${props.stats.partners} native ${toName} speakers` : `Find partners for ${toName}`
          }
        >
          <Ionicons name="airplane" size={16} color={warm.onNavy} />
          <Text style={styles.buttonPrimaryText} numberOfLines={1}>
            {boardLabel(props.stats?.partners)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const NOTCH = 18;

const createStyles = (warm: WarmColors, accent: string, backdrop: string) =>
  StyleSheet.create({
    pass: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      backgroundColor: warm.paper,
      overflow: "hidden",
      shadowColor: warm.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 40,
      paddingLeft: 14,
      backgroundColor: warm.navy,
    },
    headerText: {
      flex: 1,
      color: warm.onNavy,
      fontSize: 11,
      letterSpacing: 1.4,
      fontFamily: fontFamilies.bodyBold,
    },
    menu: {
      width: 44,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    menuPressed: { opacity: 0.6 },
    body: {
      flexDirection: "row",
    },
    main: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 12,
      gap: 6,
    },
    route: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    endpoint: {
      maxWidth: 80,
    },
    endpointTo: {
      alignItems: "flex-end",
    },
    endpointLabel: {
      color: warm.mutedInk,
      fontSize: 10,
      letterSpacing: 1.2,
      fontFamily: fontFamilies.bodyBold,
    },
    codeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 2,
    },
    code: {
      color: warm.ink,
      fontSize: 22,
      lineHeight: 26,
      fontFamily: fontFamilies.displayBold,
    },
    endpointName: {
      color: warm.inkSoft,
      fontSize: 12,
      fontFamily: fontFamilies.bodySemiBold,
      textTransform: "capitalize",
    },
    flag: {
      width: 20,
      height: 14,
      borderRadius: 3,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    flagEmoji: {
      fontSize: 13,
    },
    flight: {
      flex: 1,
      paddingTop: 12,
    },
    track: {
      height: 4,
      borderRadius: 2,
      backgroundColor: warm.creamDeep,
      justifyContent: "center",
    },
    trackFill: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      borderRadius: 2,
      backgroundColor: accent,
    },
    plane: {
      position: "absolute",
      marginLeft: -9,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.paper,
      // MDI's airplane points up; turned to fly left -> right along the route.
      transform: [{ rotate: "90deg" }],
    },
    routeCaption: {
      color: warm.inkSoft,
      fontSize: 12,
      fontFamily: fontFamilies.bodyMedium,
    },
    fields: {
      flexDirection: "row",
      gap: 14,
      marginTop: 6,
    },
    field: {
      flex: 1,
      minWidth: 0,
    },
    fieldLabel: {
      color: warm.mutedInk,
      fontSize: 10,
      letterSpacing: 1.2,
      fontFamily: fontFamilies.bodyBold,
    },
    fieldValue: {
      marginTop: 2,
      fontSize: 14,
      fontFamily: fontFamilies.displayBold,
    },
    nextRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 2,
    },
    fieldValueMuted: {
      flexShrink: 1,
      color: warm.inkSoft,
      fontSize: 14,
      fontFamily: fontFamilies.bodySemiBold,
    },
    perforation: {
      width: NOTCH,
      alignItems: "center",
      justifyContent: "space-between",
    },
    notch: {
      width: NOTCH,
      height: NOTCH,
      borderRadius: NOTCH / 2,
      backgroundColor: backdrop,
      borderWidth: 1,
      borderColor: warm.lineWarm,
    },
    notchTop: { marginTop: -NOTCH / 2 },
    notchBottom: { marginBottom: -NOTCH / 2 },
    dots: {
      flex: 1,
      justifyContent: "space-evenly",
      paddingVertical: 4,
    },
    dot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: warm.line,
    },
    stub: {
      width: 82,
      paddingVertical: 14,
      paddingRight: 12,
      paddingLeft: 4,
      alignItems: "center",
      gap: 4,
      backgroundColor: warm.peachSoft,
    },
    seat: {
      fontSize: 30,
      lineHeight: 34,
      fontFamily: fontFamilies.displayBold,
    },
    barcode: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 2,
      height: 30,
      marginTop: 4,
    },
    bar: {
      backgroundColor: warm.ink,
      opacity: 0.8,
      borderRadius: 0.5,
    },
    actions: {
      flexDirection: "row",
      gap: 10,
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: warm.line,
    },
    button: {
      minHeight: 44,
      borderRadius: 14,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    buttonSecondary: {
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.paper,
    },
    buttonSecondaryText: {
      color: warm.ink,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
    },
    buttonPrimary: {
      flex: 1,
      backgroundColor: warm.navy,
    },
    buttonPrimaryText: {
      flexShrink: 1,
      color: warm.onNavy,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
    },
    pressed: { opacity: 0.85 },
  });
