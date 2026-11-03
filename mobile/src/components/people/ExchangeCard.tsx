import React, { useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE_URL } from "../../config/api";
import { useTheme } from "../../context/ThemeContext";
import { initialsFor, languageLabel, profileChips, relationshipTag } from "../../features/peopleMatching";
import { fontFamilies } from "../../theme/typography";
import { warmColors, type WarmColors } from "../../theme/warm";
import type { PeopleCard } from "../../types";
import { avatarImage } from "../../utils/media";

// Rendered portrait size (dp), also passed to avatarImage.
export const COMPACT_PORTRAIT = 72;

export function resolveMediaUrl(path?: string | null) {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/media/")) return `${API_BASE_URL}${path}`;
  if (path.startsWith("media/")) return `${API_BASE_URL}/${path}`;
  return `${API_BASE_URL}/media/${path}`;
}

type Props = {
  profile: PeopleCard;
  /** Viewer's native language (kept for parity with the web card). */
  viewerLanguage?: string;
  /** Any "Say hello" in flight: disables every card's button. */
  busy: boolean;
  /** This card's "Say hello" is in flight. */
  starting: boolean;
  onSayHello: (username: string) => void;
  onViewProfile: (profile: PeopleCard) => void;
};

/**
 * "More people to meet" card (web ExchangeProfileCard): portrait with View profile and
 * Say hello on the left; tag, name, native language and city, chips and the goal on the right.
 */
function ExchangeCardBase({ profile, busy, starting, onSayHello, onViewProfile }: Props) {
  const { isDark } = useTheme();
  const warm = warmColors(isDark);
  const styles = useMemo(() => createStyles(warm, isDark), [warm, isDark]);
  const portrait = avatarImage(resolveMediaUrl(profile.profile_image_url), COMPACT_PORTRAIT);
  // Remember which URL failed, so a new photo for the same card is tried again.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = Boolean(portrait) && failedUri !== portrait;
  const tag = relationshipTag(profile);
  const chips = profileChips(profile);
  const goal = (profile.learning_goal || "").trim();
  const viewLabel = `View ${profile.username}'s profile`;

  return (
    <View style={styles.card}>
      <View style={styles.side}>
        <Pressable onPress={() => onViewProfile(profile)} accessibilityRole="button" accessibilityLabel={viewLabel} style={styles.portrait}>
          {showImage && portrait ? (
            <Image source={{ uri: portrait }} resizeMode="cover" style={styles.portraitImage} onError={() => setFailedUri(portrait)} />
          ) : (
            <Text style={styles.initials}>{initialsFor(profile.username)}</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => onViewProfile(profile)}
          accessibilityRole="button"
          accessibilityLabel={viewLabel}
          style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
        >
          <Ionicons name="person-outline" size={13} color={warm.ink} />
          <Text style={styles.profileButtonText}>Profile</Text>
        </Pressable>
        <Pressable
          onPress={() => onSayHello(profile.username)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Say hello to ${profile.username}`}
          accessibilityState={{ disabled: busy, busy: starting }}
          style={({ pressed }) => [styles.hello, busy && styles.disabled, pressed && styles.pressed]}
        >
          {starting ? <ActivityIndicator size="small" color={warm.onNavy} /> : <Ionicons name="chatbubble-outline" size={13} color={warm.onNavy} />}
          <Text style={styles.helloText}>{starting ? "Opening…" : "Say hello"}</Text>
        </Pressable>
      </View>

      <View style={styles.main}>
        <View style={[styles.tag, profile.match?.learns_mine && styles.tagLearns]}>
          <Text style={[styles.tagText, profile.match?.learns_mine && styles.tagTextLearns]} numberOfLines={1}>{tag}</Text>
        </View>
        <Text style={styles.name} numberOfLines={1}>{profile.username}</Text>
        <View style={styles.facts}>
          <View style={styles.fact}>
            <Ionicons name="mic-outline" size={14} color={warm.mutedInk} />
            <Text style={styles.factText}>{languageLabel(profile.native_language)} native</Text>
          </View>
          {profile.city ? (
            <View style={styles.fact}>
              <Ionicons name="location-outline" size={14} color={warm.mutedInk} />
              <Text style={styles.factText} numberOfLines={1}>{profile.city}</Text>
            </View>
          ) : null}
        </View>
        {chips.length ? (
          <View style={styles.chips}>
            {chips.map((chip) => (
              <View key={chip} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>{chip}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {goal ? (
          <View style={styles.goalQuote}>
            <Text style={styles.goalMark} accessibilityElementsHidden importantForAccessibility="no">“</Text>
            <Text style={styles.goal} numberOfLines={2}>{goal}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export const ExchangeCard = React.memo(ExchangeCardBase);

const createStyles = (warm: WarmColors, isDark: boolean) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      gap: 12,
      padding: 14,
      borderWidth: 1,
      backgroundColor: warm.paper,
      borderColor: warm.line,
      borderRadius: 20,
      shadowColor: warm.shadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 1,
    },
    // Avatar, Profile and Say hello spread with equal gaps; Say hello ends level with the goal.
    side: { width: 92, alignItems: "center", justifyContent: "space-between", gap: 6 },
    portrait: {
      width: COMPACT_PORTRAIT,
      height: COMPACT_PORTRAIT,
      borderRadius: COMPACT_PORTRAIT / 2,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.peachStrong,
      borderWidth: 3,
      borderColor: warm.peachSoft,
    },
    portraitImage: { width: "100%", height: "100%" },
    initials: { color: warm.peachDeep, fontSize: 24, fontFamily: fontFamilies.displaySemiBold },
    profileButton: {
      alignSelf: "stretch",
      minHeight: 34,
      borderRadius: 999,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      backgroundColor: warm.paper,
    },
    profileButtonText: { color: warm.ink, fontSize: 12, fontFamily: fontFamilies.bodyBold },
    hello: {
      alignSelf: "stretch",
      minHeight: 34,
      borderRadius: 999,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      backgroundColor: warm.navy,
    },
    helloText: { color: warm.onNavy, fontSize: 12, fontFamily: fontFamilies.bodyBold },
    main: { flex: 1, minWidth: 0, alignItems: "flex-start", gap: 5 },
    tag: { maxWidth: "100%", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8, backgroundColor: isDark ? "#2b2540" : "#ece6f6" },
    tagLearns: { backgroundColor: warm.peach },
    tagText: { color: isDark ? "#d4c8f0" : "#4b3a78", fontSize: 11, fontFamily: fontFamilies.bodyBold },
    tagTextLearns: { color: warm.peachDeep },
    name: { color: warm.ink, fontSize: 17, fontFamily: fontFamilies.displayBold },
    facts: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 2 },
    fact: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" },
    factText: { color: warm.inkSoft, fontSize: 12, fontFamily: fontFamilies.bodySemiBold },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
    chip: { maxWidth: "100%", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: warm.line, backgroundColor: warm.cream },
    chipText: { color: warm.inkSoft, fontSize: 11, fontFamily: fontFamilies.bodyBold },
    goalQuote: {
      alignSelf: "stretch",
      flexDirection: "row",
      gap: 4,
      marginTop: "auto",
      paddingVertical: 5,
      paddingLeft: 7,
      paddingRight: 9,
      borderLeftWidth: 3,
      borderLeftColor: warm.peachStrong,
      borderTopRightRadius: 12,
      borderBottomRightRadius: 12,
      backgroundColor: warm.peachSoft,
    },
    goalMark: { color: warm.peachInk, fontSize: 20, lineHeight: 22, fontFamily: fontFamilies.displayBold },
    goal: { flex: 1, color: warm.inkSoft, fontSize: 12, lineHeight: 17, fontStyle: "italic", fontFamily: fontFamilies.bodyRegular },
    disabled: { opacity: 0.6 },
    pressed: { opacity: 0.85 },
  });
