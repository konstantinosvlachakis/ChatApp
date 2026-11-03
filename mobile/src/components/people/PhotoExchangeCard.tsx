import React, { useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { hasOwnPhoto, initialsFor, photoCardChip, photoCardStats } from "../../features/peopleMatching";
import { fontFamilies } from "../../theme/typography";
import { warmColors, type WarmColors } from "../../theme/warm";
import type { PeopleCard } from "../../types";
import { cloudinaryImage } from "../../utils/media";
import { resolveMediaUrl } from "./ExchangeCard";

const CARD_PADDING = 10;

type Props = {
  profile: PeopleCard;
  width: number;
  viewerLanguage?: string;
  busy: boolean;
  starting: boolean;
  onSayHello: (username: string) => void;
  onViewProfile: (profile: PeopleCard) => void;
};

/**
 * Perfect exchange card (web PhotoExchangeCard, mockup I): square photo with a coral
 * "Perfect" tag and one chip, the name, one "Speaks · Learning" line, then a profile icon
 * button and Say hello.
 */
function PhotoExchangeCardBase({ profile, width, viewerLanguage, busy, starting, onSayHello, onViewProfile }: Props) {
  const { isDark } = useTheme();
  const warm = warmColors(isDark);
  const styles = useMemo(() => createStyles(warm, isDark), [warm, isDark]);
  const helloInk = isDark ? "#1b120c" : "#ffffff";
  const photoSize = width - CARD_PADDING * 2;
  const source = resolveMediaUrl(profile.profile_image_url);
  const photo = hasOwnPhoto(source) ? cloudinaryImage(source, { width: photoSize, crop: "fill", sharpen: true }) : "";
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showPhoto = Boolean(photo) && failedUri !== photo;
  const chip = photoCardChip(profile, viewerLanguage);
  const stats = photoCardStats(profile, viewerLanguage);
  const viewLabel = `View ${profile.username}'s profile`;
  const goal = (profile.learning_goal || "").trim() || "You speak the language they’re learning. They speak one of yours.";

  return (
    <View style={[styles.card, { width }]}>
      <Pressable onPress={() => onViewProfile(profile)} accessibilityRole="button" accessibilityLabel={viewLabel} style={[styles.media, { height: photoSize }]}>
        {showPhoto && photo ? (
          <Image source={{ uri: photo }} resizeMode="cover" style={styles.photo} onError={() => setFailedUri(photo)} />
        ) : (
          <View style={styles.fallbackAvatar}>
            <Text style={styles.fallbackInitials}>{initialsFor(profile.username)}</Text>
          </View>
        )}
        <View style={styles.tag} accessible accessibilityLabel="Perfect exchange">
          <Ionicons name="swap-horizontal" size={13} color={warm.peachInk} />
          <Text style={styles.tagText}>Perfect</Text>
        </View>
        {chip ? (
          <View style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={1}>{chip}</Text>
          </View>
        ) : null}
      </Pressable>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{profile.username}</Text>
        <Text style={styles.goal} numberOfLines={2}>{goal}</Text>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Speaks</Text>
            <Text style={styles.statValue} numberOfLines={1}>{stats.speaks}</Text>
          </View>
          {stats.learning ? (
            <View style={[styles.stat, styles.statDivided]}>
              <Text style={styles.statLabel}>Learning</Text>
              <Text style={styles.statValue} numberOfLines={1}>{stats.learning}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => onViewProfile(profile)}
          accessibilityRole="button"
          accessibilityLabel={viewLabel}
          style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
        >
          <Ionicons name="person-outline" size={16} color={warm.ink} />
        </Pressable>
        <Pressable
          onPress={() => onSayHello(profile.username)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Say hello to ${profile.username}`}
          accessibilityState={{ disabled: busy, busy: starting }}
          style={({ pressed }) => [styles.hello, busy && styles.disabled, pressed && styles.pressed]}
        >
          {starting ? <ActivityIndicator size="small" color={helloInk} /> : <Ionicons name="chatbubble-outline" size={15} color={helloInk} />}
          <Text style={styles.helloText}>{starting ? "Opening…" : "Say hello"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const PhotoExchangeCard = React.memo(PhotoExchangeCardBase);

const createStyles = (warm: WarmColors, isDark: boolean) =>
  StyleSheet.create({
    card: {
      padding: CARD_PADDING,
      gap: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: warm.paper,
      backgroundColor: warm.paper,
      shadowColor: warm.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 2,
    },
    media: { borderRadius: 14, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: warm.peach },
    photo: { width: "100%", height: "100%" },
    fallbackAvatar: {
      width: "46%",
      aspectRatio: 1,
      borderRadius: 999,
      borderWidth: 4,
      borderColor: warm.paper,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.peachStrong,
    },
    fallbackInitials: { color: warm.peachDeep, fontSize: 30, fontFamily: fontFamilies.displaySemiBold },
    tag: {
      position: "absolute",
      top: 8,
      left: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingLeft: 6,
      paddingRight: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: warm.paper,
    },
    tagText: { color: warm.peachInk, fontSize: 11, fontFamily: fontFamilies.bodyExtraBold },
    chip: {
      position: "absolute",
      bottom: 8,
      right: 8,
      maxWidth: "80%",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: "rgba(21, 47, 61, 0.78)",
    },
    chipText: { color: "#ffffff", fontSize: 11, fontFamily: fontFamilies.bodyBold },
    body: { paddingHorizontal: 2, gap: 4 },
    name: { color: warm.ink, fontSize: 18, fontFamily: fontFamilies.displayBold },
    goal: { color: warm.inkSoft, fontSize: 12, lineHeight: 17, fontFamily: fontFamilies.bodyMedium },
    stats: { flexDirection: "row", alignItems: "center", marginTop: 2 },
    stat: { flexShrink: 1, minWidth: 0 },
    statDivided: { marginLeft: 10, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: warm.lineWarm },
    statLabel: { color: warm.mutedInk, fontSize: 11, fontFamily: fontFamilies.bodyMedium },
    statValue: { color: warm.ink, fontSize: 13, fontFamily: fontFamilies.bodyExtraBold },
    actions: { flexDirection: "row", gap: 6 },
    profileButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: warm.lineWarm, backgroundColor: warm.paper },
    hello: {
      flex: 1,
      minHeight: 40,
      borderRadius: 999,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      // Coral on the navy night sky (web `.people-coverflow .photo-card-hello`).
      backgroundColor: warm.peachInk,
    },
    helloText: { color: isDark ? "#1b120c" : "#ffffff", fontSize: 13, fontFamily: fontFamilies.bodyBold },
    disabled: { opacity: 0.6 },
    pressed: { opacity: 0.85 },
  });
