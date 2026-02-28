import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { fetchProfile, uploadProfilePhoto } from "../services/api/auth";
import type { Profile } from "../types";
import type { ThemeColors } from "../theme/colors";
import { API_BASE_URL } from "../config/api";
import type { ProfilePhotoSlot } from "../services/api/auth";

export function ProfileScreen() {
  const { user: authUser, logout } = useAuth();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [user, setUser] = useState<Profile | null>(authUser);
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<ProfilePhotoSlot | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const previewScrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const profile = await fetchProfile();
        if (mounted) setUser(profile);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const resolveMediaUrl = (path?: string | null, withDefault = true) => {
    if (!path) {
      return withDefault ? `${API_BASE_URL}/media/profile_images/MainAfter.jpg` : "";
    }
    if (path.startsWith("http")) return path;
    if (path.startsWith("/media/")) return `${API_BASE_URL}${path}`;
    return `${API_BASE_URL}/media/${path}`;
  };

  const profileImage = resolveMediaUrl(user?.profile_image_url);
  const complementaryOne = resolveMediaUrl(user?.complementary_image_1_url, false);
  const complementaryTwo = resolveMediaUrl(user?.complementary_image_2_url, false);
  const practicingLanguages = user?.languages_practicing || [];
  const complementaryCards: Array<{ key: ProfilePhotoSlot; image: string }> = [
    { key: "complementary_1", image: complementaryOne },
    { key: "complementary_2", image: complementaryTwo },
  ];
  const previewImages = [profileImage, complementaryOne, complementaryTwo].filter(Boolean);

  const onUploadPhoto = async (slot: ProfilePhotoSlot) => {
    if (!user?.user_id) {
      Alert.alert("Upload failed", "Missing user id. Please re-login and try again.");
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow photo access to upload images.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    if (!asset.uri) {
      Alert.alert("Upload failed", "Could not read selected image.");
      return;
    }

    try {
      setUploadingSlot(slot);
      const payload = await uploadProfilePhoto({
        userId: user.user_id,
        slot,
        imageUri: asset.uri,
        fileName: asset.fileName || `profile-${slot}-${Date.now()}.jpg`,
        mimeType: asset.mimeType || "image/jpeg",
      });
      setUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          profile_image_url: payload.profile_image_url || prev.profile_image_url,
          complementary_image_1_url:
            payload.complementary_image_1_url || prev.complementary_image_1_url,
          complementary_image_2_url:
            payload.complementary_image_2_url || prev.complementary_image_2_url,
        };
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        "Could not upload photo.";
      Alert.alert("Upload failed", message);
    } finally {
      setUploadingSlot(null);
    }
  };

  const onLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          try {
            setLoggingOut(true);
            await logout();
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Text style={styles.pageTitle}>Profile</Text>
          <Pressable style={styles.logoutButton} onPress={onLogout} disabled={loggingOut}>
            <Text style={styles.logoutButtonText}>{loggingOut ? "Logging out..." : "Log out"}</Text>
          </Pressable>
        </View>

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
            {user?.username || "Profile"}
            {typeof user?.age === "number" ? `, ${user.age}` : ""}
          </Text>
          <Pressable
            style={styles.editButton}
            onPress={() => Alert.alert("Coming soon", "Edit profile on mobile will be added next.")}
          >
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </Pressable>
        </View>

        <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Personal Information</Text>
          <Text style={styles.rowText}>
            <Text style={styles.rowLabel}>Name:</Text> {user?.username || "N/A"}
          </Text>
          <Text style={styles.rowText}>
            <Text style={styles.rowLabel}>Age:</Text>{" "}
            {typeof user?.age === "number" ? user.age : "Not provided"}
          </Text>
          <Text style={styles.rowText}>
            <Text style={styles.rowLabel}>Bio:</Text> Passionate about learning new languages and
            connecting with people from different cultures.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Languages</Text>
          <Text style={styles.rowText}>
            <Text style={styles.rowLabel}>Native Language:</Text>{" "}
            {user?.native_language || "N/A"}
          </Text>
          <Text style={[styles.rowText, styles.rowLabel]}>Languages Practicing:</Text>
          <View style={styles.chipsWrap}>
            {(practicingLanguages.length ? practicingLanguages : ["English", "Spanish", "French"]).map(
              (lang) => (
                <View key={lang} style={styles.chip}>
                  <Text style={styles.chipText}>{lang}</Text>
                </View>
              )
            )}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Learning Goals</Text>
          <Text style={styles.rowText}>
            My goal is to become fluent and confident in new languages for both travel and
            communication.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Photos</Text>
          <Text style={styles.rowText}>Tap to upload or replace your photos.</Text>

          <Pressable
            style={[styles.photoWrap, styles.profilePhotoWrap]}
            onPress={() => onUploadPhoto("profile")}
            disabled={Boolean(uploadingSlot)}
          >
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.photo} />
            ) : (
              <View style={[styles.photoPlaceholder, styles.photoPlaceholderDashed]}>
                <Text style={styles.photoPlaceholderIcon}>+</Text>
              </View>
            )}
            {uploadingSlot === "profile" ? (
              <View style={styles.photoOverlay}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.photoOverlayText}>Uploading...</Text>
              </View>
            ) : null}
          </Pressable>

          <View style={styles.complementaryRow}>
            {complementaryCards.map((card) => (
              <Pressable
                key={card.key}
                style={styles.photoWrap}
                onPress={() => onUploadPhoto(card.key)}
                disabled={Boolean(uploadingSlot)}
              >
                {card.image ? (
                  <Image source={{ uri: card.image }} style={styles.photo} />
                ) : (
                  <View style={[styles.photoPlaceholder, styles.photoPlaceholderDashed]}>
                    <Text style={styles.photoPlaceholderIcon}>+</Text>
                  </View>
                )}
                {uploadingSlot === card.key ? (
                  <View style={styles.photoOverlay}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.photoOverlayText}>Uploading...</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
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
                <Pressable
                  style={styles.previewSlideTopClose}
                  onPress={() => setIsPreviewOpen(false)}
                />
                <View style={styles.previewImageTouchBlock}>
                  <Image source={{ uri: image }} style={styles.previewImage} resizeMode="contain" />
                </View>
                <Pressable
                  style={styles.previewSlideBottomClose}
                  onPress={() => setIsPreviewOpen(false)}
                />
              </View>
            ))}
          </ScrollView>
          <Pressable style={styles.previewBottomCloseArea} onPress={() => setIsPreviewOpen(false)} />
          {previewImages.length > 1 ? (
            <View style={styles.previewDots}>
              {previewImages.map((_, index) => (
                <View
                  key={`dot-${index}`}
                  style={[
                    styles.previewDot,
                    index === previewIndex && styles.previewDotActive,
                  ]}
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
    content: { padding: 16, gap: 12 },
    topBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 2,
    },
    pageTitle: {
      color: colors.text,
      fontWeight: "800",
      fontSize: 28,
    },
    logoutButton: {
      backgroundColor: colors.danger,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
    },
    logoutButtonText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 13,
    },
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
      marginBottom: 12,
      textTransform: "capitalize",
    },
    editButton: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    editButtonText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 16,
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
    photosRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 6,
    },
    complementaryRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 10,
    },
    photoWrap: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: 14,
      overflow: "hidden",
    },
    profilePhotoWrap: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    photo: {
      width: "100%",
      height: "100%",
      borderRadius: 14,
      backgroundColor: colors.surfaceMuted,
    },
    photoPlaceholder: {
      width: "100%",
      height: "100%",
      borderRadius: 14,
      backgroundColor: colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    photoPlaceholderDashed: {
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: colors.border,
      backgroundColor: "transparent",
    },
    photoPlaceholderIcon: {
      color: colors.mutedText,
      fontSize: 34,
      lineHeight: 34,
      fontWeight: "300",
    },
    photoOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(15,23,42,0.55)",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    photoOverlayText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 12,
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
