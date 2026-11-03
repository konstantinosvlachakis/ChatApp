import React, { useMemo } from "react";
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";
import type { PeopleCard } from "../../types";
import { ExchangeCard } from "./ExchangeCard";

type Props = {
  profiles: PeopleCard[];
  warm: WarmColors;
  viewerLanguage: string;
  startingUsername: string;
  onSayHello: (username: string) => void;
  onViewProfile: (profile: PeopleCard) => void;
};

export function PerfectMatchesRail({ profiles, warm, viewerLanguage, startingUsername, onSayHello, onViewProfile }: Props) {
  const { width, fontScale } = useWindowDimensions();
  const styles = useMemo(() => createStyles(warm), [warm]);
  // Leave a glimpse of the next card. Larger text gets the full available width.
  const cardWidth = fontScale > 1.3 ? Math.min(width - 32, 380) : Math.min(width - 64, 280);
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>BETTER TOGETHER</Text>
        <Text style={styles.title} accessibilityRole="header">Perfect exchanges</Text>
        <Text style={styles.subtitle}>They speak a language you’re learning. They’re learning one you speak.</Text>
        {profiles.length > 1 ? <Text style={styles.hint}>Swipe to meet your exchanges →</Text> : null}
      </View>
      <FlatList
        horizontal
        data={profiles}
        keyExtractor={(profile) => profile.username}
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + 12}
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={styles.cards}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View style={{ width: cardWidth }}>
            <ExchangeCard
              profile={item}
              featured
              viewerLanguage={viewerLanguage}
              busy={Boolean(startingUsername)}
              starting={startingUsername === item.username}
              onSayHello={onSayHello}
              onViewProfile={onViewProfile}
            />
          </View>
        )}
      />
    </View>
  );
}

const createStyles = (warm: WarmColors) => StyleSheet.create({
  section: { marginHorizontal: -16, marginTop: 4, marginBottom: 4 },
  heading: { paddingHorizontal: 16, gap: 5, marginBottom: 14 },
  eyebrow: { color: warm.teal, fontFamily: fontFamilies.bodyExtraBold, fontSize: 10, letterSpacing: 1.4 },
  title: { color: warm.ink, fontFamily: fontFamilies.displayBold, fontSize: 23 },
  subtitle: { color: warm.mutedInk, fontFamily: fontFamilies.bodyMedium, fontSize: 13 },
  hint: { color: warm.teal, fontFamily: fontFamilies.bodyBold, fontSize: 12, marginTop: 3 },
  cards: { paddingHorizontal: 16, gap: 12, paddingBottom: 4, alignItems: "flex-start" },
});
