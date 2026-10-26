import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL } from "../config/api";
import { ReportUserModal } from "../components/ReportUserModal";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  blockUser,
  fetchPublicProfile,
  reportUser,
  unblockUser,
} from "../services/api/auth";
import { createOrGetConversation } from "../services/api/conversations";
import type { Profile } from "../types";
import type { ThemeColors } from "../theme/colors";
import { fontFamilies } from "../theme/typography";

const LANGUAGE_FLAG_MAP: Record<string, string> = {
  arabic: "🇸🇦",
  chinese: "🇨🇳",
  dutch: "🇳🇱",
  english: "🇬🇧",
  french: "🇫🇷",
  german: "🇩🇪",
  greek: "🇬🇷",
  hindi: "🇮🇳",
  italian: "🇮🇹",
  japanese: "🇯🇵",
  korean: "🇰🇷",
  portuguese: "🇵🇹",
  russian: "🇷🇺",
  spanish: "🇪🇸",
  swedish: "🇸🇪",
  turkish: "🇹🇷",
  ukrainian: "🇺🇦",
};

const PRACTICE_LEVELS = [
  {
    title: "Brave Beginner",
    subtitle: "Warming up the vocal cords",
  },
  {
    title: "Conversation Surfer",
    subtitle: "Catching longer exchanges",
  },
  {
    title: "Accent Adventurer",
    subtitle: "Playing with rhythm and nuance",
  },
  {
    title: "Fluency Chaser",
    subtitle: "Getting smoother every week",
  },
];

function getLanguageFlag(language?: string | null) {
  if (!language) return "🌍";
  return LANGUAGE_FLAG_MAP[language.trim().toLowerCase()] || "🌍";
}

function getLanguagePalette(language: string, colors: ThemeColors, index = 0) {
  const palettes = [
    {
      tint: `${colors.primary}12`,
      border: `${colors.primary}26`,
      badge: "#F7FBFF",
    },
    {
      tint: "#FFF7EC",
      border: "#F2D5A9",
      badge: "#FFFDF8",
    },
    {
      tint: "#F2FBF8",
      border: "#BEE5D8",
      badge: "#FCFFFE",
    },
    {
      tint: "#F7F4FF",
      border: "#D8CCF4",
      badge: "#FCFAFF",
    },
  ];
  return palettes[index % palettes.length];
}

export function PublicProfileScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const routeProfile = route.params?.profile as Profile | undefined;
  const routeUsername =
    (route.params?.username as string | undefined) || (routeProfile?.username as string | undefined);

  const [profile, setProfile] = React.useState<Profile | null>(routeProfile || null);
  const [loading, setLoading] = React.useState(!routeProfile);
  const [error, setError] = React.useState("");
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const [previewIndex, setPreviewIndex] = React.useState(0);
  const [blocking, setBlocking] = React.useState(false);
  const [reporting, setReporting] = React.useState(false);
  const [startingConversation, setStartingConversation] = React.useState(false);
  const [reportModalOpen, setReportModalOpen] = React.useState(false);
  const [profileActionsOpen, setProfileActionsOpen] = React.useState(false);
  const previewScrollRef = React.useRef<ScrollView | null>(null);

  React.useEffect(() => {
    if (!routeUsername) {
      setError("Missing username.");
      return;
    }

    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const payload = await fetchPublicProfile(routeUsername);
        if (!mounted) return;
        setProfile((prev) => ({ ...prev, ...payload }));
        setError("");
      } catch {
        if (!mounted) return;
        setProfile((prev) => prev || routeProfile || null);
        setError(routeProfile ? "" : "Could not load this profile.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [routeProfile, routeUsername]);

  const resolveMediaUrl = (path?: string | null, withDefault = true) => {
    if (!path) {
      return withDefault ? `${API_BASE_URL}/media/profile_images/MainAfter.jpg` : "";
    }
    if (path.startsWith("http")) return path;
    if (path.startsWith("/media/")) return `${API_BASE_URL}${path}`;
    return `${API_BASE_URL}/media/${path}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error || "Profile not found."}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const profileImage = resolveMediaUrl(profile.profile_image_url);
  const complementaryOne = resolveMediaUrl(profile.complementary_image_1_url, false);
  const complementaryTwo = resolveMediaUrl(profile.complementary_image_2_url, false);
  const previewImages = [profileImage, complementaryOne, complementaryTwo].filter(Boolean);
  const practicingLanguages = profile.languages_practicing || [];
  const isOwnProfile = user?.username === profile.username;
  const ageLabel = typeof profile.age === "number" ? String(profile.age) : null;
  const nativeLanguage = profile.native_language || "Not shared";
  const bioText =
    profile.bio ||
    "Passionate about language exchange, thoughtful conversations, and meeting people with a different cultural perspective.";
  const learningGoalText =
    profile.learning_goal ||
    "I want to improve fluency and become more confident in real conversations.";
  const locationText = profile.location || "Open to global conversations";
  const nativeLanguagePalette = getLanguagePalette(nativeLanguage, colors, 0);
  const practiceLanguageCards = practicingLanguages.map((language, index) => {
    const level = PRACTICE_LEVELS[index % PRACTICE_LEVELS.length];
    return {
      language,
      flag: getLanguageFlag(language),
      levelTitle: level.title,
      levelSubtitle: level.subtitle,
      palette: getLanguagePalette(language, colors, index + 1),
    };
  });

  const handleToggleBlock = () => {
    if (!profile.username || isOwnProfile || blocking) return;
    const isBlocked = Boolean(profile.is_blocked_by_me);
    setProfileActionsOpen(false);
    (async () => {
      try {
        setBlocking(true);
        if (isBlocked) {
          await unblockUser(profile.username);
          setProfile((prev) =>
            prev ? { ...prev, is_blocked_by_me: false, has_blocked_me: false } : prev
          );
        } else {
          await blockUser(profile.username);
          setProfile((prev) =>
            prev ? { ...prev, is_blocked_by_me: true, has_blocked_me: false } : prev
          );
        }
      } catch {
        Alert.alert("Failed", `Could not ${isBlocked ? "unblock" : "block"} this user.`);
      } finally {
        setBlocking(false);
      }
    })();
  };

  const submitReport = async (reason: string, details = "") => {
    if (!profile.username || reporting) return;
    try {
      setReporting(true);
      await reportUser({ username: profile.username, reason, details });
      Alert.alert("Report sent", "Thanks. We will review this report.");
      setReportModalOpen(false);
    } catch {
      Alert.alert("Failed", "Could not send this report.");
    } finally {
      setReporting(false);
    }
  };

  const handleMoreActions = () => {
    if (isOwnProfile) return;
    setProfileActionsOpen(true);
  };

  const handleStartConversation = async () => {
    if (!profile.username || isOwnProfile || startingConversation) return;
    try {
      setStartingConversation(true);
      const { id } = await createOrGetConversation(profile.username);
      navigation.navigate("Chats", {
        screen: "ChatsHome",
        params: {
          openConversationId: id,
          openFromBannerAt: Date.now(),
        },
      });
    } catch {
      Alert.alert("Failed", "Could not start a conversation.");
    } finally {
      setStartingConversation(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.heroGlowPrimary} />
          <View style={styles.heroGlowSecondary} />
          {!isOwnProfile ? (
            <Pressable style={styles.heroMenuButton} onPress={handleMoreActions}>
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
            </Pressable>
          ) : null}
          <View style={styles.heroMediaRow}>
            <Pressable
              onPress={() => {
                setPreviewIndex(0);
                setIsPreviewOpen(true);
                requestAnimationFrame(() => {
                  previewScrollRef.current?.scrollTo({ x: 0, animated: false });
                });
              }}
              style={styles.avatarShell}
            >
              <Image source={{ uri: profileImage }} style={styles.avatar} />
            </Pressable>
            <View style={styles.heroIdentity}>
              <View style={styles.heroEyebrowRow}>
                <Text style={styles.heroEyebrow}>LANGUAGE PARTNER</Text>
                <View style={styles.heroStatusPill}>
                  <View style={styles.heroStatusDot} />
                  <Text style={styles.heroStatusText}>Open to chat</Text>
                </View>
              </View>
              <Text style={styles.heroTitle}>
                {profile.username}
                {ageLabel ? `, ${ageLabel}` : ""}
              </Text>
              <Text style={styles.heroSubtitle}>
                Native in {nativeLanguage}{"\n"}{locationText}
              </Text>
            </View>
          </View>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{nativeLanguage}</Text>
              <Text style={styles.heroStatLabel}>Native language</Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>
                {practicingLanguages.length ? practicingLanguages.length : 0}
              </Text>
              <Text style={styles.heroStatLabel}>Practicing</Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{ageLabel || "?"}</Text>
              <Text style={styles.heroStatLabel}>Age</Text>
            </View>
          </View>

        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.sectionSubtitle}>A quick feel for who they are</Text>
            </View>
          </View>
          <Text style={styles.bioLead}>{bioText}</Text>
          <View style={styles.aboutAccentCard}>
            <Text style={styles.aboutAccentLabel}>Conversation vibe</Text>
            <Text style={styles.aboutAccentText}>
              {profile.learning_goal
                ? "Focused on meaningful practice and steady progress."
                : "Open to easygoing conversations, cultural exchange, and consistent speaking practice."}
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="language-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionTitle}>Languages</Text>
              <Text style={styles.sectionSubtitle}>A tiny language passport with current vibes</Text>
            </View>
          </View>
          <View
            style={[
              styles.languageFeatureCard,
              {
                backgroundColor: nativeLanguagePalette.tint,
                borderColor: nativeLanguagePalette.border,
              },
            ]}
          >
            <View
              style={[
                styles.languageBadgeCircle,
                { backgroundColor: nativeLanguagePalette.badge, borderColor: nativeLanguagePalette.border },
              ]}
            >
              <Text style={styles.languageBadgeEmoji}>{getLanguageFlag(nativeLanguage)}</Text>
            </View>
            <View style={styles.languageFeatureCopy}>
              <Text style={styles.languageFeatureLabel}>Native language</Text>
              <Text style={styles.languageFeatureValue}>{nativeLanguage}</Text>
              <Text style={styles.languageFeatureMeta}>Home Turf</Text>
            </View>
          </View>
          <Text style={styles.miniSectionLabel}>Practicing now</Text>
          {practiceLanguageCards.length ? (
            <View style={styles.languageCardsColumn}>
              {practiceLanguageCards.map((item) => (
                <View
                  key={item.language}
                  style={[
                    styles.practiceLanguageCard,
                    {
                      backgroundColor: item.palette.tint,
                      borderColor: item.palette.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.languageBadgeCircle,
                      {
                        backgroundColor: item.palette.badge,
                        borderColor: item.palette.border,
                      },
                    ]}
                  >
                    <Text style={styles.languageBadgeEmoji}>{item.flag}</Text>
                  </View>
                  <View style={styles.practiceLanguageCopy}>
                    <View style={styles.practiceLanguageTopRow}>
                      <Text style={styles.practiceLanguageName}>{item.language}</Text>
                      <View style={styles.levelPill}>
                        <Text style={styles.levelPillText}>{item.levelTitle}</Text>
                      </View>
                    </View>
                    <Text style={styles.practiceLanguageSubtitle}>{item.levelSubtitle}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyLanguageState}>
              <Text style={styles.emptyLanguageTitle}>New language slot waiting</Text>
              <Text style={styles.emptyLanguageText}>
                They have not added a practice language yet.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="rocket-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionTitle}>Learning Goal</Text>
              <Text style={styles.sectionSubtitle}>What they hope to get from the connection</Text>
            </View>
          </View>
          <Text style={styles.goalQuoteMark}>“</Text>
          <Text style={styles.goalText}>{learningGoalText}</Text>
        </View>

        {previewImages.length > 1 ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name="images-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.sectionHeaderCopy}>
                <Text style={styles.sectionTitle}>Photo Moments</Text>
                <Text style={styles.sectionSubtitle}>A little more personality at a glance</Text>
              </View>
            </View>
            <View style={styles.galleryRow}>
              {previewImages.slice(0, 3).map((image, index) => (
                <Pressable
                  key={`${image}-${index}-thumb`}
                  style={[styles.galleryTile, index === 0 ? styles.galleryTileLarge : styles.galleryTileSmall]}
                  onPress={() => {
                    setPreviewIndex(index);
                    setIsPreviewOpen(true);
                    requestAnimationFrame(() => {
                      previewScrollRef.current?.scrollTo({ x: width * index, animated: false });
                    });
                  }}
                >
                  <Image source={{ uri: image }} style={styles.galleryImage} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.footerSpacer} />
      </ScrollView>

      {!isOwnProfile ? (
        <View style={styles.floatingActionWrap}>
          <Pressable
            style={styles.floatingActionButton}
            onPress={handleStartConversation}
            disabled={startingConversation}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
            <Text style={styles.floatingActionText}>
              {startingConversation ? "Opening..." : "Message"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={isPreviewOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPreviewOpen(false)}
      >
        <View style={styles.previewBackdrop}>
          <Pressable style={styles.previewTopCloseArea} onPress={() => setIsPreviewOpen(false)} />
          <Pressable style={styles.previewCloseButton} onPress={() => setIsPreviewOpen(false)}>
            <Text style={styles.previewCloseText}>Close</Text>
          </Pressable>
          <ScrollView
            ref={previewScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
              setPreviewIndex(nextIndex);
            }}
            style={styles.previewCarousel}
          >
            {previewImages.map((image, index) => (
              <View key={`${image}-${index}`} style={[styles.previewSlideTapZone, { width }]}> 
                <Pressable style={styles.previewSlideTopClose} onPress={() => setIsPreviewOpen(false)} />
                <View style={styles.previewImageTouchBlock}>
                  <Image source={{ uri: image }} style={styles.previewImage} resizeMode="contain" />
                </View>
                <Pressable style={styles.previewSlideBottomClose} onPress={() => setIsPreviewOpen(false)} />
              </View>
            ))}
          </ScrollView>
          <Pressable style={styles.previewBottomCloseArea} onPress={() => setIsPreviewOpen(false)} />
          {previewImages.length > 1 ? (
            <View style={styles.previewDots}>
              {previewImages.map((_, index) => (
                <View
                  key={`dot-${index}`}
                  style={[styles.previewDot, index === previewIndex && styles.previewDotActive]}
                />
              ))}
            </View>
          ) : null}
        </View>
      </Modal>

      <ReportUserModal
        colors={colors}
        visible={reportModalOpen}
        username={profile.username}
        loading={reporting}
        onClose={() => setReportModalOpen(false)}
        onSubmit={({ reason, details }) => submitReport(reason, details)}
      />
      <Modal
        transparent
        visible={profileActionsOpen}
        animationType="fade"
        onRequestClose={() => setProfileActionsOpen(false)}
      >
        <View style={styles.menuOverlay}>
          <Pressable style={styles.menuOverlayTouchable} onPress={() => setProfileActionsOpen(false)} />
          <View style={styles.actionsSheetWrap}>
            <View style={styles.actionsSheet}>
              <View style={styles.actionsHandle} />
              <View style={styles.actionsHeader}>
                <View style={styles.actionsHeaderIcon}>
                  <Ionicons name="person-circle-outline" size={18} color={colors.primary} />
                </View>
                <View style={styles.actionsHeaderTextWrap}>
                  <Text style={styles.actionsTitle}>{profile.username}</Text>
                  <Text style={styles.actionsSubtitle}>Profile options</Text>
                </View>
              </View>

              <Pressable
                style={[styles.actionsItem, styles.actionsItemDestructive]}
                onPress={() => {
                  setProfileActionsOpen(false);
                  setReportModalOpen(true);
                }}
              >
                <View style={[styles.actionsItemIconWrap, styles.actionsItemIconWrapDestructive]}>
                  <Ionicons name="flag-outline" size={18} color={colors.danger} />
                </View>
                <View style={styles.actionsItemBody}>
                  <Text style={[styles.actionsItemTitle, styles.actionsItemTitleDanger]}>Report user</Text>
                  <Text style={styles.actionsItemSubtitle}>
                    Let us know if something feels unsafe
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={[styles.actionsItem, styles.actionsItemWarning]}
                onPress={handleToggleBlock}
                disabled={blocking}
              >
                <View style={[styles.actionsItemIconWrap, styles.actionsItemIconWrapWarning]}>
                  {blocking ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons
                      name={profile.is_blocked_by_me ? "checkmark-circle-outline" : "ban-outline"}
                      size={18}
                      color={colors.primary}
                    />
                  )}
                </View>
                <View style={styles.actionsItemBody}>
                  <Text style={styles.actionsItemTitle}>
                    {profile.is_blocked_by_me ? "Unblock user" : "Block user"}
                  </Text>
                  <Text style={styles.actionsItemSubtitle}>
                    {profile.is_blocked_by_me
                      ? "Allow this user to contact you again"
                      : "Prevent this user from contacting you"}
                  </Text>
                </View>
              </Pressable>

              <Pressable style={styles.actionsCancel} onPress={() => setProfileActionsOpen(false)}>
                <Text style={styles.actionsCancelText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: colors.mutedText, fontSize: 14 },
    content: { padding: 16, gap: 14 },
    heroCard: {
      backgroundColor: colors.surface,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      position: "relative",
      overflow: "hidden",
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 5,
    },
    heroGlowPrimary: {
      position: "absolute",
      width: 210,
      height: 210,
      borderRadius: 105,
      backgroundColor: colors.overlayTint,
      top: -86,
      right: -52,
    },
    heroGlowSecondary: {
      position: "absolute",
      width: 130,
      height: 130,
      borderRadius: 65,
      backgroundColor: `${colors.primary}12`,
      bottom: -34,
      left: -28,
    },
    heroMenuButton: {
      position: "absolute",
      top: 14,
      right: 14,
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 3,
    },
    heroMediaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      paddingTop: 8,
    },
    avatarShell: {
      padding: 4,
      borderRadius: 999,
      backgroundColor: colors.surface,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    avatar: {
      width: 108,
      height: 108,
      borderRadius: 54,
      borderWidth: 3,
      borderColor: colors.primary,
    },
    heroIdentity: {
      flex: 1,
      minWidth: 0,
    },
    heroEyebrowRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 8,
    },
    heroEyebrow: {
      color: colors.link,
      fontSize: 11,
      letterSpacing: 1.4,
      fontFamily: fontFamilies.bodyBold,
    },
    heroStatusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: `${colors.success}14`,
    },
    heroStatusDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: colors.success,
    },
    heroStatusText: {
      color: colors.success,
      fontSize: 11,
      fontFamily: fontFamilies.bodyBold,
    },
    heroTitle: {
      fontSize: 31,
      fontFamily: fontFamilies.displayBold,
      color: colors.text,
      textTransform: "capitalize",
      lineHeight: 38,
    },
    heroSubtitle: {
      color: colors.mutedText,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 6,
      fontFamily: fontFamilies.bodyMedium,
    },
    heroStatsRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 18,
    },
    heroStatCard: {
      flex: 1,
      borderRadius: 18,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingHorizontal: 10,
    },
    heroStatValue: {
      color: colors.text,
      fontSize: 17,
      fontFamily: fontFamilies.displaySemiBold,
    },
    heroStatLabel: {
      color: colors.mutedText,
      fontSize: 11,
      marginTop: 4,
      fontFamily: fontFamilies.bodyBold,
    },
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      gap: 10,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    sectionIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceMuted,
    },
    sectionHeaderCopy: {
      flex: 1,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 24,
      fontFamily: fontFamilies.displayBold,
    },
    sectionSubtitle: {
      color: colors.mutedText,
      fontSize: 12,
      marginTop: 2,
      fontFamily: fontFamilies.bodyMedium,
    },
    bioLead: {
      color: colors.text,
      fontSize: 16,
      lineHeight: 25,
      fontFamily: fontFamilies.bodyMedium,
    },
    aboutAccentCard: {
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    aboutAccentLabel: {
      color: colors.link,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 1,
      fontFamily: fontFamilies.bodyBold,
      marginBottom: 6,
    },
    aboutAccentText: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 23,
      fontFamily: fontFamilies.bodyMedium,
    },
    languageFeatureCard: {
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: `${colors.primary}10`,
      borderWidth: 1,
      borderColor: `${colors.primary}24`,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    languageFeatureCopy: {
      flex: 1,
    },
    languageBadgeCircle: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    languageBadgeEmoji: {
      fontSize: 24,
    },
    languageFeatureLabel: {
      color: colors.link,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 1,
      fontFamily: fontFamilies.bodyBold,
      marginBottom: 6,
    },
    languageFeatureValue: {
      color: colors.text,
      fontSize: 24,
      fontFamily: fontFamilies.displayBold,
    },
    languageFeatureMeta: {
      color: colors.mutedText,
      fontSize: 13,
      marginTop: 4,
      fontFamily: fontFamilies.bodySemiBold,
    },
    miniSectionLabel: {
      color: colors.text,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
    },
    rowText: {
      color: colors.mutedText,
      fontSize: 16,
      lineHeight: 24,
      fontFamily: fontFamilies.bodyMedium,
    },
    rowLabel: {
      color: colors.text,
      fontFamily: fontFamilies.bodyBold,
    },
    chipsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 2,
    },
    languageCardsColumn: {
      gap: 10,
      marginTop: 2,
    },
    practiceLanguageCard: {
      borderRadius: 20,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    practiceLanguageCopy: {
      flex: 1,
    },
    practiceLanguageTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    practiceLanguageName: {
      color: colors.text,
      fontSize: 18,
      fontFamily: fontFamilies.displayBold,
      textTransform: "capitalize",
      flexShrink: 1,
    },
    practiceLanguageSubtitle: {
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 4,
      fontFamily: fontFamilies.bodyMedium,
    },
    levelPill: {
      borderRadius: 999,
      backgroundColor: "#FFFFFFCC",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    levelPillText: {
      color: colors.text,
      fontSize: 11,
      letterSpacing: 0.2,
      fontFamily: fontFamilies.bodyBold,
    },
    emptyLanguageState: {
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyLanguageTitle: {
      color: colors.text,
      fontSize: 15,
      fontFamily: fontFamilies.bodyBold,
      marginBottom: 4,
    },
    emptyLanguageText: {
      color: colors.mutedText,
      fontSize: 14,
      lineHeight: 21,
      fontFamily: fontFamilies.bodyMedium,
    },
    chip: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipText: {
      color: colors.text,
      fontSize: 14,
      fontFamily: fontFamilies.bodySemiBold,
    },
    goalQuoteMark: {
      color: `${colors.primary}40`,
      fontSize: 54,
      lineHeight: 48,
      marginTop: -4,
      fontFamily: fontFamilies.displayBold,
    },
    goalText: {
      color: colors.text,
      fontSize: 17,
      lineHeight: 27,
      marginTop: -8,
      fontFamily: fontFamilies.bodyMedium,
    },
    galleryRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 2,
    },
    galleryTile: {
      overflow: "hidden",
      borderRadius: 18,
      backgroundColor: colors.surfaceMuted,
    },
    galleryTileLarge: {
      flex: 1.4,
      aspectRatio: 0.92,
    },
    galleryTileSmall: {
      flex: 1,
      aspectRatio: 0.92,
    },
    galleryImage: {
      width: "100%",
      height: "100%",
    },
    footerSpacer: {
      height: 80,
    },
    floatingActionWrap: {
      position: "absolute",
      left: 16,
      right: 16,
      bottom: 14,
    },
    floatingActionButton: {
      minHeight: 54,
      borderRadius: 18,
      backgroundColor: colors.navy,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    floatingActionText: {
      color: "#fff",
      fontSize: 16,
      fontFamily: fontFamilies.displaySemiBold,
    },
    previewBackdrop: {
      flex: 1,
      backgroundColor: "rgba(2,6,23,0.92)",
      alignItems: "center",
    },
    previewTopCloseArea: {
      width: "100%",
      height: 72,
    },
    previewImage: {
      width: "100%",
      height: "100%",
    },
    previewCarousel: {
      width: "100%",
      flex: 1,
    },
    previewSlideTapZone: {
      height: "100%",
      alignItems: "center",
    },
    previewSlideTopClose: {
      width: "100%",
      flex: 1,
    },
    previewImageTouchBlock: {
      width: "100%",
      height: "76%",
      alignItems: "center",
      justifyContent: "center",
    },
    previewSlideBottomClose: {
      width: "100%",
      flex: 1,
    },
    previewBottomCloseArea: {
      width: "100%",
      height: 72,
    },
    previewDots: {
      position: "absolute",
      bottom: 42,
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    previewDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: "rgba(255,255,255,0.45)",
    },
    previewDotActive: {
      width: 18,
      borderRadius: 4,
      backgroundColor: "#fff",
    },
    previewCloseButton: {
      position: "absolute",
      top: 56,
      right: 20,
      zIndex: 2,
      backgroundColor: "rgba(255,255,255,0.14)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.3)",
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
    },
    previewCloseText: {
      color: "#fff",
      fontFamily: fontFamilies.bodyBold,
    },
    menuOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(8, 15, 33, 0.26)",
      justifyContent: "flex-end",
      alignItems: "stretch",
    },
    menuOverlayTouchable: {
      ...StyleSheet.absoluteFillObject,
    },
    actionsSheetWrap: {
      paddingHorizontal: 12,
      paddingBottom: 12,
    },
    actionsSheet: {
      borderRadius: 24,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 14,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
    actionsHandle: {
      alignSelf: "center",
      width: 42,
      height: 5,
      borderRadius: 999,
      backgroundColor: colors.border,
      marginBottom: 12,
      opacity: 0.9,
    },
    actionsHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 10,
      paddingHorizontal: 2,
    },
    actionsHeaderIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceMuted,
    },
    actionsHeaderTextWrap: {
      flex: 1,
    },
    actionsTitle: {
      color: colors.text,
      fontSize: 22,
      fontFamily: fontFamilies.displayBold,
    },
    actionsSubtitle: {
      color: colors.mutedText,
      fontSize: 13,
      marginTop: 2,
      fontFamily: fontFamilies.bodyMedium,
    },
    actionsItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 18,
      paddingHorizontal: 10,
      paddingVertical: 12,
      backgroundColor: colors.surface,
    },
    actionsItemWarning: {
      backgroundColor: colors.surfaceMuted,
    },
    actionsItemDestructive: {
      backgroundColor: `${colors.danger}08`,
    },
    actionsItemIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceMuted,
    },
    actionsItemIconWrapWarning: {
      backgroundColor: colors.surface,
    },
    actionsItemIconWrapDestructive: {
      backgroundColor: `${colors.danger}14`,
    },
    actionsItemBody: {
      flex: 1,
    },
    actionsItemTitle: {
      color: colors.text,
      fontSize: 15,
      fontFamily: fontFamilies.bodyBold,
    },
    actionsItemTitleDanger: {
      color: colors.danger,
    },
    actionsItemSubtitle: {
      color: colors.mutedText,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
      fontFamily: fontFamilies.bodyMedium,
    },
    actionsCancel: {
      marginTop: 10,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      backgroundColor: colors.surfaceMuted,
    },
    actionsCancelText: {
      color: colors.text,
      fontSize: 15,
      fontFamily: fontFamilies.bodyBold,
    },
  });
