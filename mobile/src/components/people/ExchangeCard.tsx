import React, { useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { API_BASE_URL } from "../../config/api";
import { useTheme } from "../../context/ThemeContext";
import { describeExchange, initialsFor, matchBadge, matchRelationship } from "../../features/peopleMatching";
import { fontFamilies } from "../../theme/typography";
import { warmColors, type WarmColors } from "../../theme/warm";
import type { PeopleCard } from "../../types";
import { avatarImage } from "../../utils/media";

// Rendered portrait sizes (dp), also passed to avatarImage.
export const FEATURED_PORTRAIT = 112;
export const COMPACT_PORTRAIT = 64;

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
          <Text style={styles.matchBadgeText}>{matchBadge(profile.match)}</Text>
        </View>
      ) : null}
      <View style={styles.headRow}>
        <Pressable
          onPress={() => onViewProfile(profile)}
          accessibilityRole="button"
          accessibilityLabel={viewLabel}
          style={[styles.portrait, { width: size, height: size, borderRadius: size / 2 }, featured && styles.portraitFeatured]}
        >
          {showImage && portrait ? (
            <Image source={{ uri: portrait }} style={styles.portraitImage} onError={() => setFailedUri(portrait)} />
          ) : (
            <Text style={[styles.initials, { fontSize: Math.round(size * 0.36) }]}>{initialsFor(profile.username)}</Text>
          )}
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={[styles.name, featured && styles.nameFeatured]} numberOfLines={2}>
            {profile.username}
          </Text>
          {featured ? (
            <View style={styles.nativeBadge}>
              <Text style={styles.nativeBadgeText}>{copy.native} native</Text>
            </View>
          ) : (
            <View style={[styles.inlineMatch, relationship.reciprocal && styles.inlineMatchReciprocal]}>
              <Text style={styles.inlineMatchText}>
                <Text accessibilityElementsHidden importantForAccessibility="no">{relationship.icon} </Text>
                {relationship.label}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.languages}>
        <View style={[styles.languagePill, styles.languageNative]}>
          <Text style={styles.languageCaption}>{copy.nativeCaption}</Text>
          <Text style={styles.languageValue} numberOfLines={1}>{copy.native}</Text>
        </View>
        {copy.learning ? (
          <View style={[styles.languagePill, styles.languageLearning]}>
            <Text style={styles.languageCaption}>{copy.learningCaption}</Text>
            <Text style={styles.languageValue} numberOfLines={1}>
              {copy.learning}
              {copy.level ? <Text style={styles.languageLevel}>{` · ${copy.level}`}</Text> : null}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.goal, featured && styles.goalFeatured]} numberOfLines={featured ? 3 : 2}>
        {copy.goal}
      </Text>

      <View style={styles.actions}>
        <Pressable
          onPress={() => onViewProfile(profile)}
          accessibilityRole="button"
          accessibilityLabel={viewLabel}
          style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && styles.pressed]}
        >
          <Text style={styles.buttonPrimaryText}>View profile</Text>
        </Pressable>
        <Pressable
          onPress={() => onSayHello(profile.username)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Say hello to ${profile.username}`}
          accessibilityState={{ disabled: busy, busy: starting }}
          style={({ pressed }) => [styles.button, styles.buttonSecondary, busy && styles.disabled, pressed && styles.pressed]}
        >
          {starting ? <ActivityIndicator size="small" color={warm.teal} /> : null}
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
      padding: 18,
    },
    cardFeatured: {
      backgroundColor: warm.peachSoft,
      borderColor: warm.lineWarm,
      borderRadius: 28,
    },
    cardCompact: {
      backgroundColor: warm.paper,
      borderColor: warm.line,
      borderRadius: 24,
    },
    matchBadge: {
      alignSelf: "flex-start",
      backgroundColor: warm.sage,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 5,
      marginBottom: 14,
    },
    matchBadgeText: {
      color: warm.teal,
      fontSize: 12,
      fontFamily: fontFamilies.bodyExtraBold,
    },
    headRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    portrait: {
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.peachStrong,
      borderWidth: 3,
      borderColor: warm.paper,
    },
    portraitFeatured: {
      borderWidth: 5,
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
    name: {
      color: warm.ink,
      fontSize: 17,
      fontFamily: fontFamilies.displayBold,
    },
    nameFeatured: {
      fontSize: 23,
    },
    nativeBadge: {
      backgroundColor: warm.peach,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    nativeBadgeText: {
      color: warm.peachInk,
      fontSize: 12,
      fontFamily: fontFamilies.bodyBold,
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
    },
    languagePill: {
      flex: 1,
      minWidth: 0,
      borderRadius: 16,
      paddingHorizontal: 11,
      paddingVertical: 8,
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
      marginTop: 12,
      fontFamily: fontFamilies.bodyRegular,
    },
    goalFeatured: {
      fontSize: 14,
      lineHeight: 21,
    },
    actions: {
      flexDirection: "row",
      gap: 8,
      marginTop: 14,
    },
    button: {
      flex: 1,
      minHeight: 44,
      borderRadius: 999,
      paddingHorizontal: 14,
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
    },
    disabled: {
      opacity: 0.6,
    },
    pressed: {
      opacity: 0.85,
    },
  });
