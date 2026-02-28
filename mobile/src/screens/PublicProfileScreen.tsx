import React from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { API_BASE_URL } from "../config/api";
import { useTheme } from "../context/ThemeContext";
import { fetchPublicProfile } from "../services/api/auth";
import type { Profile } from "../types";
import type { ThemeColors } from "../theme/colors";

export function PublicProfileScreen() {
  const route = useRoute<any>();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const routeUsername = route.params?.username as string | undefined;
  const routeProfile = route.params?.profile as Profile | undefined;

  const [profile, setProfile] = React.useState<Profile | null>(routeProfile || null);
  const [loading, setLoading] = React.useState(!routeProfile);
  const [error, setError] = React.useState("");
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const [previewIndex, setPreviewIndex] = React.useState(0);
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
        setError("Could not load this profile.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [routeUsername]);

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
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView style={styles.container}>
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
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
      fontWeight: "800",
      color: colors.text,
      textTransform: "capitalize",
      textAlign: "center",
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
      fontWeight: "800",
      marginBottom: 6,
    },
    rowText: {
      color: colors.mutedText,
      fontSize: 16,
      lineHeight: 24,
    },
    rowLabel: {
      color: colors.text,
      fontWeight: "700",
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
      fontWeight: "600",
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
      fontWeight: "700",
    },
  });
