import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontFamilies } from "../theme/typography";

type CoachAvatarProps = {
  language?: string | null;
  size?: number;
  variant?: "default" | "flat";
  hideBadge?: boolean;
};

export function CoachAvatar({
  language,
  size = 48,
  variant = "default",
  hideBadge = false,
}: CoachAvatarProps) {
  const compact = size <= 36;
  const showBadge = size >= 54 && !hideBadge;
  const borderRadius = Math.max(12, Math.round(size * 0.3));
  const plateRadius = compact ? Math.max(8, Math.round(size * 0.24)) : Math.max(12, Math.round(size * 0.26));
  const initialSize = compact ? Math.max(14, Math.round(size * 0.42)) : Math.max(18, Math.round(size * 0.4));
  const accent = String(language || "").trim().toUpperCase().slice(0, 10);
  const isFlat = variant === "flat";

  return (
    <View
      style={[
        styles.frame,
        isFlat ? styles.frameFlat : null,
        { width: size, height: size, borderRadius },
      ]}
    >
      <View style={[styles.blob, styles.blobNavy, compact ? styles.blobNavyCompact : null]} />
      <View style={[styles.blob, styles.blobTeal, compact ? styles.blobTealCompact : null]} />
      <View style={[styles.blob, styles.blobBlush, compact ? styles.blobBlushCompact : null]} />

      <View
        style={[
          styles.plate,
          isFlat ? styles.plateFlat : null,
          compact ? styles.plateCompact : null,
          { borderRadius: plateRadius },
        ]}
      >
        <Text style={[styles.initial, compact ? styles.initialCompact : null, { fontSize: initialSize }]}>
          L
        </Text>
      </View>

      {showBadge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{accent || "L3"}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0d1c2b",
    borderWidth: 1,
    borderColor: "rgba(20,49,74,0.12)",
  },
  frameFlat: {
    backgroundColor: "#102131",
    borderColor: "rgba(20,49,74,0.08)",
  },
  blob: {
    position: "absolute",
  },
  blobNavy: {
    width: "78%",
    height: "86%",
    left: "-6%",
    top: "-10%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 42,
    borderBottomLeftRadius: 26,
    backgroundColor: "#17324a",
    transform: [{ rotate: "-8deg" }],
  },
  blobNavyCompact: {
    width: "84%",
    height: "88%",
    left: "-10%",
    top: "-8%",
  },
  blobTeal: {
    width: "76%",
    height: "50%",
    left: "8%",
    bottom: "-6%",
    borderTopLeftRadius: 34,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 40,
    backgroundColor: "#1b7f79",
    transform: [{ rotate: "7deg" }],
  },
  blobTealCompact: {
    width: "82%",
    height: "46%",
    left: "4%",
    bottom: "-8%",
  },
  blobBlush: {
    width: "46%",
    height: "46%",
    right: "-4%",
    top: "-2%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 28,
    borderBottomLeftRadius: 18,
    backgroundColor: "#ecb1d0",
    transform: [{ rotate: "9deg" }],
  },
  blobBlushCompact: {
    width: "44%",
    height: "44%",
    right: "-6%",
    top: "-4%",
  },
  plate: {
    minWidth: "50%",
    minHeight: "50%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
  },
  plateFlat: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  plateCompact: {
    minWidth: "44%",
    minHeight: "44%",
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  initial: {
    color: "#ffffff",
    fontFamily: fontFamilies.displayBold,
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  initialCompact: {
    textShadowColor: "rgba(8,19,32,0.16)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  badge: {
    position: "absolute",
    bottom: "8%",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(248,251,255,0.92)",
  },
  badgeText: {
    color: "#14314a",
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: 7,
    letterSpacing: 0.4,
  },
});
