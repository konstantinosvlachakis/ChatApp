import React, { useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE_URL } from "../../config/api";
import { useTheme } from "../../context/ThemeContext";
import { describeExchange, initialsFor, matchBadge, matchRelationship } from "../../features/peopleMatching";
import { fontFamilies } from "../../theme/typography";
import { warmColors, type WarmColors } from "../../theme/warm";
import type { PeopleCard } from "../../types";
import { avatarImage } from "../../utils/media";

// Rendered portrait sizes (dp), also passed to avatarImage.
export const FEATURED_PORTRAIT = 96;
export const COMPACT_PORTRAIT = 76;

function resolveMediaUrl(path?: string | null) {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/media/")) return `${API_BASE_URL}${path}`;
  if (path.startsWith("media/")) return `${API_BASE_URL}/${path}`;
  return `${API_BASE_URL}/media/${path}`;
}

type Props = {
  profile: PeopleCard;
  featured?: boolean;
  /** Viewer's native language (decides "Learning your language"). */
  viewerLanguage?: string;
  /** Any "Say hello" in flight: disables every card's button. */
  busy: boolean;
  /** This card's "Say hello" is in flight. */
  starting: boolean;
  onSayHello: (username: string) => void;
  onViewProfile: (profile: PeopleCard) => void;
};

function ExchangeCardBase({ profile, featured = false, viewerLanguage, busy, starting, onSayHello, onViewProfile }: Props) {
  const { isDark } = useTheme();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const warm = warmColors(isDark);
  const styles = useMemo(() => createStyles(warm), [warm]);
  const size = featured ? FEATURED_PORTRAIT : COMPACT_PORTRAIT;
  const portrait = avatarImage(resolveMediaUrl(profile.profile_image_url), size);
  // Remember which URL failed, so a new photo for the same card is tried again.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = Boolean(portrait) && failedUri !== portrait;
  const copy = describeExchange(profile, viewerLanguage, featured);
  const relationship = matchRelationship(profile.match);
  const viewLabel = `View ${profile.username}'s profile`;


  return (
    <View style={[styles.card, featured ? styles.cardFeatured : styles.cardCompact]}>
      {featured ? (
        <View style={styles.matchBadge}>
          <Ionicons name={profile.match?.reciprocal ? "sparkles" : "globe-outline"} size={14} color={warm.teal} />
          <Text style={styles.matchBadgeText}>{matchBadge(profile.match)}</Text>
        </View>
      ) : null}
      <View style={[styles.headRow, featured && styles.headFeatured]}>
        <Pressable
          onPress={() => onViewProfile(profile)}
          accessibilityRole="button"
          accessibilityLabel={viewLabel}
          style={[styles.portrait, featured ? styles.portraitFeatured : { width: size, height: size }]}
        >
          {showImage && portrait ? (
            <Image source={{ uri: portrait }} resizeMode="cover" style={styles.portraitImage} onError={() => setFailedUri(portrait)} />
          ) : (
            <Text style={[styles.initials, { fontSize: featured ? 34 : 27 }]}>{initialsFor(profile.username)}</Text>
          )}
        </Pressable>
        <View style={[styles.titleBlock, featured && styles.titleFeatured]}>
          <Text style={[styles.name, featured && styles.nameFeatured]} numberOfLines={2}>
            {profile.username}
          </Text>
          {featured ? (
            <View style={styles.nativeBadge}>
              <Ionicons name="globe-outline" size={14} color={warm.peachInk} />
              <Text style={styles.nativeBadgeText}>{copy.native} native speaker</Text>
            </View>
          ) : (
            <View style={[styles.inlineMatch, relationship.reciprocal && styles.inlineMatchReciprocal]}>
              <Text style={styles.inlineMatchText}>
                <Text accessibilityElementsHidden importantForAccessibility="no">{relationship.reciprocal ? "✦" : "↗"} </Text>
                {relationship.label}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.languages, largeText && styles.stacked]}>
        <View style={[styles.languagePill, styles.languageNative]}>
          <Text style={styles.languageCaption}>{copy.nativeCaption}</Text>
          <Text style={styles.languageValue}>{copy.native}</Text>
        </View>
        {copy.learning ? (
          <View style={[styles.languagePill, styles.languageLearning]}>
            <Text style={styles.languageCaption}>{copy.learningCaption}</Text>
            <Text style={styles.languageValue}>{copy.learning}</Text>
            {copy.level ? <Text style={styles.languageLevel}>{copy.level}</Text> : null}
          </View>
        ) : null}
      </View>

      <View style={styles.goalBlock}>
        <Ionicons name="chatbubbles-outline" size={17} color={warm.teal} style={styles.goalIcon} />
        <Text style={[styles.goal, featured && styles.goalFeatured]} numberOfLines={largeText ? undefined : 3}>
          {copy.goal}
        </Text>
      </View>

      <View style={[styles.actions, largeText && styles.stacked]}>
        <Pressable
          onPress={() => onViewProfile(profile)}
          accessibilityRole="button"
          accessibilityLabel={viewLabel}
          style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && styles.pressed]}
        >
          <Text style={styles.buttonPrimaryText}>View profile</Text>
          <Ionicons name="arrow-forward" size={16} color={warm.onAction} />
        </Pressable>
        <Pressable
          onPress={() => onSayHello(profile.username)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Say hello to ${profile.username}`}
          accessibilityState={{ disabled: busy, busy: starting }}
          style={({ pressed }) => [styles.button, styles.buttonSecondary, busy && styles.disabled, pressed && styles.pressed]}
        >
          {starting ? <ActivityIndicator size="small" color={warm.teal} /> : <Ionicons name="chatbubble-ellipses-outline" size={17} color={warm.ink} />}
          <Text style={styles.buttonSecondaryText}>{starting ? "Opening…" : "Say hello"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const ExchangeCard = React.memo(ExchangeCardBase);

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    card: {
      borderWidth: 1,
      padding: 16,
      shadowColor: warm.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 2,
    },
    cardFeatured: {
      backgroundColor: warm.paper,
      borderColor: warm.lineWarm,
      borderRadius: 28,
    },
    cardCompact: {
      backgroundColor: warm.paper,
      borderColor: warm.line,
      borderRadius: 24,
    },
    matchBadge: {
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: warm.sage,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 14,
    },
    matchBadgeText: {
      color: warm.teal,
      fontSize: 12,
      fontFamily: fontFamilies.bodyExtraBold,
      flexShrink: 1,
    },
    headRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    headFeatured: { flexDirection: "column", alignItems: "center", gap: 12 },
    portrait: {
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.peachStrong,
      borderRadius: 23,
    },
    portraitFeatured: {
      width: FEATURED_PORTRAIT,
      height: FEATURED_PORTRAIT,
      borderRadius: 26,
    },
    portraitImage: {
      width: "100%",
      height: "100%",
    },
    initials: {
      color: warm.peachDeep,
      fontFamily: fontFamilies.displaySemiBold,
    },
    titleBlock: {
      flex: 1,
      minWidth: 0,
      alignItems: "flex-start",
      gap: 6,
    },
    titleFeatured: { flex: 0, paddingHorizontal: 2, alignItems: "center", width: "100%" },
    name: {
      color: warm.ink,
      fontSize: 17,
      fontFamily: fontFamilies.displayBold,
    },
    nameFeatured: {
      fontSize: 21,
      textAlign: "center",
    },
    nativeBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    nativeBadgeText: {
      color: warm.peachInk,
      fontSize: 12,
      fontFamily: fontFamilies.bodyBold,
      flexShrink: 1,
    },
    inlineMatch: {
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
      backgroundColor: warm.peachSoft,
    },
    inlineMatchReciprocal: {
      backgroundColor: warm.sage,
    },
    inlineMatchText: {
      color: warm.teal,
      fontSize: 12,
      fontFamily: fontFamilies.bodyBold,
    },
    languages: {
      flexDirection: "row",
      gap: 8,
      marginTop: 14,
      alignItems: "stretch",
    },
    stacked: { flexDirection: "column" },
    languagePill: {
      flex: 1,
      minWidth: 0,
      borderRadius: 16,
      paddingHorizontal: 11,
      paddingVertical: 8,
      gap: 3,
    },
    languageNative: {
      backgroundColor: warm.peach,
    },
    languageLearning: {
      backgroundColor: warm.sage,
    },
    languageCaption: {
      color: warm.mutedInk,
      fontSize: 12,
      fontFamily: fontFamilies.bodyMedium,
    },
    languageValue: {
      color: warm.ink,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
    },
    languageLevel: {
      color: warm.mutedInk,
      fontSize: 12,
      fontFamily: fontFamilies.bodyMedium,
    },
    goal: {
      color: warm.mutedInk,
      fontSize: 13,
      lineHeight: 20,
      flex: 1,
      fontFamily: fontFamilies.bodyRegular,
    },
    goalBlock: { flexDirection: "row", gap: 9, marginTop: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: warm.line },
    goalIcon: { marginTop: 2 },
    goalFeatured: {
      fontSize: 14,
      lineHeight: 21,
    },
    actions: {
      flexDirection: "row",
      gap: 8,
      marginTop: 2,
    },
    button: {
      flex: 1,
      minHeight: 48,
      borderRadius: 16,
      paddingHorizontal: 10,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    buttonPrimary: {
      backgroundColor: warm.action,
    },
    buttonPrimaryText: {
      color: warm.onAction,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
      flexShrink: 1,
    },
    buttonSecondary: {
      backgroundColor: warm.secondary,
      borderWidth: 1,
      borderColor: warm.lineWarm,
    },
    buttonSecondaryText: {
      color: warm.ink,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
      flexShrink: 1,
    },
    disabled: {
      opacity: 0.6,
    },
    pressed: {
      opacity: 0.85,
    },
  });
