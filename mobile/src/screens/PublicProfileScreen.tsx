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
          {!isOwnProfile ? (
            <Pressable style={styles.heroMenuButton} onPress={handleMoreActions}>
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              setPreviewIndex(0);
              setIsPreviewOpen(true);
              requestAnimationFrame(() => {
                previewScrollRef.current?.scrollTo({ x: 0, animated: false });
              });
            }}
          >
            <Image source={{ uri: profileImage }} style={styles.avatar} />
          </Pressable>
          <Text style={styles.heroTitle}>
            {profile.username}
            {typeof profile.age === "number" ? `, ${profile.age}` : ""}
          </Text>
          {!isOwnProfile ? (
            <View style={styles.actionRow}>
              <Pressable
                style={styles.primaryActionButton}
                onPress={handleStartConversation}
                disabled={startingConversation}
              >
                <Text style={styles.primaryActionButtonText}>
                  {startingConversation ? "Opening..." : "Start conversation"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <Text style={styles.rowText}>
            <Text style={styles.rowLabel}>Name:</Text> {profile.username || "N/A"}
          </Text>
          <Text style={styles.rowText}>
            <Text style={styles.rowLabel}>Age:</Text>{" "}
            {typeof profile.age === "number" ? profile.age : "Not provided"}
          </Text>
          <Text style={styles.rowText}>
            <Text style={styles.rowLabel}>Bio:</Text>{" "}
            {profile.bio ||
              "Passionate about learning new languages and connecting with people from different cultures."}
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Languages</Text>
          <Text style={styles.rowText}>
            <Text style={styles.rowLabel}>Native Language:</Text> {profile.native_language || "N/A"}
          </Text>
          <Text style={[styles.rowText, styles.rowLabel]}>Languages Practicing:</Text>
          <View style={styles.chipsWrap}>
            {(practicingLanguages.length ? practicingLanguages : ["Not provided"]).map((lang) => (
              <View key={lang} style={styles.chip}>
                <Text style={styles.chipText}>{lang}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Learning Goals</Text>
          <Text style={styles.rowText}>
            {profile.learning_goal ||
              "I want to improve fluency and become more confident in real conversations."}
          </Text>
        </View>
      </ScrollView>

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
    content: { padding: 16, gap: 12 },
    heroCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      alignItems: "center",
      position: "relative",
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
    },
    avatar: {
      width: 110,
      height: 110,
      borderRadius: 55,
      borderWidth: 3,
      borderColor: colors.primary,
      marginBottom: 12,
    },
    heroTitle: {
      fontSize: 34,
      fontFamily: fontFamilies.displayBold,
      color: colors.text,
      textTransform: "capitalize",
      textAlign: "center",
    },
    actionRow: {
      marginTop: 12,
      width: "100%",
      justifyContent: "center",
    },
    primaryActionButton: {
      minHeight: 48,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    primaryActionButtonText: {
      color: "#ffffff",
      fontSize: 15,
      fontFamily: fontFamilies.displaySemiBold,
    },
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 6,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 24,
      fontFamily: fontFamilies.displayBold,
      marginBottom: 6,
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
      marginTop: 4,
    },
    chip: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipText: {
      color: colors.text,
      fontSize: 14,
      fontFamily: fontFamilies.bodySemiBold,
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
