import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { fontFamilies } from "../theme/typography";

// The LangVoyage mark (also Lumi's avatar). The PNG is generated from the web's
// src/brand/logoMark.js (frontend/scripts/build-brand-icons.js), so web and mobile match.
const LOGO_MARK = require("../../assets/brand/logo-mark.png");

type CoachAvatarProps = {
  language?: string | null;
  size?: number;
  /** Kept for existing callers; the mark looks the same in both variants. */
  variant?: "default" | "flat";
  hideBadge?: boolean;
};

export function CoachAvatar({ language, size = 48, hideBadge = false }: CoachAvatarProps) {
  const showBadge = size >= 54 && !hideBadge;
  const borderRadius = Math.max(8, Math.round(size * 0.27));
  const accent = String(language || "").trim().toUpperCase().slice(0, 10);

  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius }]}>
      <Image
        source={LOGO_MARK}
        style={{ width: size, height: size }}
        contentFit="cover"
        accessible={false}
      />
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
