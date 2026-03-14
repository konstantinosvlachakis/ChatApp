import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fontFamilies } from "../theme/typography";

const premiumFeatures = [
  {
    icon: "sparkles-outline" as const,
    title: "Unlimited AI coaching",
    description: "Practice longer sessions with Lumi and unlock smarter follow-up guidance.",
  },
  {
    icon: "mic-outline" as const,
    title: "Pronunciation feedback",
    description: "Get deeper speaking feedback with targeted corrections and replay drills.",
  },
  {
    icon: "flash-outline" as const,
    title: "Personalized study plans",
    description: "Receive weekly goals, streak boosts, and lesson suggestions tuned to your level.",
  },
  {
    icon: "people-outline" as const,
    title: "Priority matching",
    description: "Reach more relevant partners faster with boosted visibility in the community.",
  },
];

const whyPremium = [
  "AI conversations and speech feedback are the most resource-intensive parts of the app.",
  "Premium helps fund safer moderation, faster matching, and better coaching quality for everyone.",
  "A paid plan keeps the free tier usable while giving serious learners stronger tools to improve faster.",
];

export function PremiumScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={18} color={colors.text} />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroGlowA} />
          <View style={styles.heroGlowB} />
          <Text style={styles.heroEyebrow}>LangVoyage Premium</Text>
          <Text style={styles.heroTitle}>Learn with more depth, speed, and support.</Text>
          <Text style={styles.heroText}>
            This mockup positions Premium as the focused plan for learners who want stronger coaching,
            more speaking reps, and a faster path to confidence.
          </Text>

          <View style={styles.priceRow}>
            <View>
              <Text style={styles.priceValue}>$12.99/mo</Text>
              <Text style={styles.priceHint}>Cancel anytime. Free trial ready for checkout flow.</Text>
            </View>
            <View style={styles.priceBadge}>
              <Text style={styles.priceBadgeText}>Most Popular</Text>
            </View>
          </View>

          <View style={styles.heroActions}>
            <Pressable
              style={styles.primaryButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.primaryButtonText}>Start 7-day free trial</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.secondaryButtonText}>Maybe later</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>3x</Text>
            <Text style={styles.statLabel}>More AI practice time</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>Weekly</Text>
            <Text style={styles.statLabel}>Progress plans and insights</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>Priority</Text>
            <Text style={styles.statLabel}>Support and partner matching</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>What you unlock</Text>
          <Text style={styles.sectionSubtitle}>
            Premium is presented as a serious-practice toolkit, not just a cosmetic upgrade.
          </Text>
          <View style={styles.featureList}>
            {premiumFeatures.map((feature) => (
              <View key={feature.title} style={styles.featureCard}>
                <View style={styles.featureIconWrap}>
                  <Ionicons name={feature.icon} size={18} color={colors.primary} />
                </View>
                <View style={styles.featureCopy}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureText}>{feature.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Why Premium exists</Text>
          <Text style={styles.sectionSubtitle}>
            This section justifies the subscription in plain language so it feels fair, not pushy.
          </Text>
          <View style={styles.reasonList}>
            {whyPremium.map((reason, index) => (
              <View key={reason} style={styles.reasonRow}>
                <View style={styles.reasonIndex}>
                  <Text style={styles.reasonIndexText}>{index + 1}</Text>
                </View>
                <Text style={styles.reasonText}>{reason}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.compareCard}>
          <Text style={styles.sectionTitle}>Free vs Premium</Text>
          <View style={styles.compareHeader}>
            <Text style={styles.compareLabel}>Free</Text>
            <Text style={styles.compareLabel}>Premium</Text>
          </View>
          <View style={styles.compareRow}>
            <Text style={styles.compareFeature}>Daily AI practice</Text>
            <Text style={styles.compareFree}>Limited</Text>
            <Text style={styles.comparePremium}>Unlimited</Text>
          </View>
          <View style={styles.compareRow}>
            <Text style={styles.compareFeature}>Pronunciation analysis</Text>
            <Text style={styles.compareFree}>Basic</Text>
            <Text style={styles.comparePremium}>Detailed</Text>
          </View>
          <View style={styles.compareRow}>
            <Text style={styles.compareFeature}>Partner discovery</Text>
            <Text style={styles.compareFree}>Standard</Text>
            <Text style={styles.comparePremium}>Priority</Text>
          </View>
          <View style={styles.compareRow}>
            <Text style={styles.compareFeature}>Study plans</Text>
            <Text style={styles.compareFree}>No</Text>
            <Text style={styles.comparePremium}>Yes</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
      paddingBottom: 36,
      gap: 16,
    },
    topBar: {
      marginBottom: 4,
    },
    backButton: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    backButtonText: {
      color: colors.text,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
    },
    heroCard: {
      position: "relative",
      overflow: "hidden",
      borderRadius: 30,
      padding: 22,
      backgroundColor: colors.navy,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.08)",
    },
    heroGlowA: {
      position: "absolute",
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: "rgba(27,127,121,0.35)",
      top: -20,
      right: -10,
    },
    heroGlowB: {
      position: "absolute",
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: "rgba(236,177,208,0.28)",
      bottom: -30,
      left: -18,
    },
    heroEyebrow: {
      color: "#9edfd6",
      fontSize: 12,
      letterSpacing: 1.4,
      textTransform: "uppercase",
      fontFamily: fontFamilies.displayBold,
    },
    heroTitle: {
      marginTop: 10,
      color: "#ffffff",
      fontSize: 31,
      lineHeight: 38,
      fontFamily: fontFamilies.displayBold,
      maxWidth: "90%",
    },
    heroText: {
      marginTop: 10,
      color: "rgba(255,255,255,0.84)",
      fontSize: 15,
      lineHeight: 22,
      fontFamily: fontFamilies.bodyMedium,
    },
    priceRow: {
      marginTop: 18,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
    },
    priceValue: {
      color: "#ffffff",
      fontSize: 28,
      fontFamily: fontFamilies.displayBold,
    },
    priceHint: {
      marginTop: 4,
      color: "rgba(255,255,255,0.72)",
      fontSize: 13,
      lineHeight: 19,
      fontFamily: fontFamilies.bodyMedium,
      maxWidth: 200,
    },
    priceBadge: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: "#f4d77a",
    },
    priceBadgeText: {
      color: "#5a4300",
      fontSize: 12,
      fontFamily: fontFamilies.bodyExtraBold,
    },
    heroActions: {
      marginTop: 20,
      gap: 10,
    },
    primaryButton: {
      minHeight: 50,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#ffffff",
    },
    primaryButtonText: {
      color: colors.navy,
      fontSize: 15,
      fontFamily: fontFamilies.bodyExtraBold,
    },
    secondaryButton: {
      minHeight: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.08)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
    },
    secondaryButtonText: {
      color: "#ffffff",
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
    },
    statsRow: {
      flexDirection: "row",
      gap: 10,
    },
    statCard: {
      flex: 1,
      minHeight: 96,
      borderRadius: 22,
      padding: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: "space-between",
    },
    statValue: {
      color: colors.text,
      fontSize: 20,
      fontFamily: fontFamilies.displayBold,
    },
    statLabel: {
      color: colors.mutedText,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: fontFamilies.bodyMedium,
    },
    sectionCard: {
      borderRadius: 24,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      gap: 14,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 20,
      fontFamily: fontFamilies.displaySemiBold,
    },
    sectionSubtitle: {
      color: colors.mutedText,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fontFamilies.bodyMedium,
    },
    featureList: {
      gap: 12,
    },
    featureCard: {
      flexDirection: "row",
      gap: 12,
      padding: 14,
      borderRadius: 18,
      backgroundColor: colors.surfaceMuted,
    },
    featureIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    featureCopy: {
      flex: 1,
    },
    featureTitle: {
      color: colors.text,
      fontSize: 15,
      fontFamily: fontFamilies.bodyExtraBold,
    },
    featureText: {
      marginTop: 3,
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: fontFamilies.bodyMedium,
    },
    reasonList: {
      gap: 12,
    },
    reasonRow: {
      flexDirection: "row",
      gap: 12,
      alignItems: "flex-start",
    },
    reasonIndex: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    reasonIndexText: {
      color: "#ffffff",
      fontSize: 13,
      fontFamily: fontFamilies.bodyExtraBold,
    },
    reasonText: {
      flex: 1,
      color: colors.text,
      fontSize: 14,
      lineHeight: 21,
      fontFamily: fontFamilies.bodyMedium,
    },
    compareCard: {
      borderRadius: 24,
      padding: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
    },
    compareHeader: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 30,
      paddingBottom: 4,
    },
    compareLabel: {
      width: 72,
      textAlign: "center",
      color: colors.mutedText,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 1.1,
      fontFamily: fontFamilies.bodyBold,
    },
    compareRow: {
      flexDirection: "row",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 12,
    },
    compareFeature: {
      flex: 1,
      color: colors.text,
      fontSize: 14,
      fontFamily: fontFamilies.bodySemiBold,
    },
    compareFree: {
      width: 72,
      textAlign: "center",
      color: colors.mutedText,
      fontSize: 13,
      fontFamily: fontFamilies.bodyMedium,
    },
    comparePremium: {
      width: 72,
      textAlign: "center",
      color: colors.primary,
      fontSize: 13,
      fontFamily: fontFamilies.bodyExtraBold,
    },
  });
