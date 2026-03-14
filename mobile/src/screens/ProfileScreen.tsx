import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getCoachLanguageOptions } from "../features/coachConversation";
import { fetchProfile, updateProfile, uploadProfilePhoto } from "../services/api/auth";
import type { Profile } from "../types";
import type { ThemeColors } from "../theme/colors";
import { API_BASE_URL } from "../config/api";
import type { ProfilePhotoSlot } from "../services/api/auth";
import { fontFamilies } from "../theme/typography";

export function ProfileScreen() {
  const { user: authUser } = useAuth();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [user, setUser] = useState<Profile | null>(authUser);
  const [loading, setLoading] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<ProfilePhotoSlot | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const previewScrollRef = useRef<ScrollView | null>(null);
  const languageOptions = React.useMemo(() => getCoachLanguageOptions(user), [user]);
  const [editForm, setEditForm] = useState({
    username: "",
    email: "",
    location: "",
    nativeLanguage: "english",
    baseLanguage: "english",
    practiceLanguage: "english",
    bio: "",
    learningGoal: "",
  });

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

  useEffect(() => {
    const fallback = languageOptions[0]?.value || "english";
    setEditForm({
      username: user?.username || "",
      email: user?.email || "",
      location: user?.location || "",
      nativeLanguage: (user?.native_language || fallback).trim().toLowerCase(),
      baseLanguage: (user?.base_translate_language || user?.native_language || fallback)
        .trim()
        .toLowerCase(),
      practiceLanguage: (user?.languages_practicing?.[0] || fallback).trim().toLowerCase(),
      bio: user?.bio || "",
      learningGoal: user?.learning_goal || "",
    });
  }, [languageOptions, user]);

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

  const updateEditField = (field: keyof typeof editForm, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

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

  const handleSaveProfile = async () => {
    try {
      setSavingProfile(true);
      const payload = await updateProfile({
        username: editForm.username.trim(),
        email: editForm.email.trim().toLowerCase(),
        location: editForm.location.trim(),
        native_language: editForm.nativeLanguage,
        base_translate_language: editForm.baseLanguage,
        languages_practicing: editForm.practiceLanguage ? [editForm.practiceLanguage] : [],
        bio: editForm.bio.trim(),
        learning_goal: editForm.learningGoal.trim(),
      });
      const mergedProfile = { ...user, ...payload } as Profile;
      setUser(mergedProfile);
      setIsEditProfileOpen(false);
      Alert.alert("Profile updated", "Your profile changes have been saved.");
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        "Could not update your profile.";
      Alert.alert("Save failed", message);
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Text style={styles.pageTitle}>Profile</Text>
          <Pressable style={styles.settingsButton} onPress={() => navigation.navigate("Settings")}>
            <Ionicons name="settings-outline" size={20} color={colors.text} />
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
            onPress={() => setIsEditProfileOpen(true)}
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
            <Text style={styles.rowLabel}>Bio:</Text>{" "}
            {user?.bio?.trim() || "Tell people a little about yourself."}
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
            {user?.learning_goal?.trim() ||
              "My goal is to become fluent and confident in new languages for both travel and communication."}
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

      <Modal
        visible={isEditProfileOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsEditProfileOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.editModalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.editModalBackdropTouchable} onPress={() => setIsEditProfileOpen(false)} />
          <View style={styles.editModalSheet}>
            <View style={styles.editModalHeader}>
              <View>
                <Text style={styles.editModalEyebrow}>Profile</Text>
                <Text style={styles.editModalTitle}>Edit profile</Text>
              </View>
              <Pressable style={styles.editModalCloseButton} onPress={() => setIsEditProfileOpen(false)}>
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.editModalContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Username</Text>
                <TextInput
                  value={editForm.username}
                  onChangeText={(value) => updateEditField("username", value)}
                  style={styles.input}
                  placeholder="Username"
                  placeholderTextColor={colors.mutedText}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  value={editForm.email}
                  onChangeText={(value) => updateEditField("email", value)}
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={colors.mutedText}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Location</Text>
                <TextInput
                  value={editForm.location}
                  onChangeText={(value) => updateEditField("location", value)}
                  style={styles.input}
                  placeholder="City, Country"
                  placeholderTextColor={colors.mutedText}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Native language</Text>
                <View style={styles.languageChips}>
                  {languageOptions.map((option) => {
                    const active = editForm.nativeLanguage === option.value;
                    return (
                      <Pressable
                        key={`native-${option.value}`}
                        style={[styles.languageChip, active ? styles.languageChipActive : undefined]}
                        onPress={() => updateEditField("nativeLanguage", option.value)}
                      >
                        <Text style={[styles.languageChipText, active ? styles.languageChipTextActive : undefined]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Base translate language</Text>
                <View style={styles.languageChips}>
                  {languageOptions.map((option) => {
                    const active = editForm.baseLanguage === option.value;
                    return (
                      <Pressable
                        key={`base-${option.value}`}
                        style={[styles.languageChip, active ? styles.languageChipActive : undefined]}
                        onPress={() => updateEditField("baseLanguage", option.value)}
                      >
                        <Text style={[styles.languageChipText, active ? styles.languageChipTextActive : undefined]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Main practice language</Text>
                <View style={styles.languageChips}>
                  {languageOptions.map((option) => {
                    const active = editForm.practiceLanguage === option.value;
                    return (
                      <Pressable
                        key={`practice-${option.value}`}
                        style={[styles.languageChip, active ? styles.languageChipActive : undefined]}
                        onPress={() => updateEditField("practiceLanguage", option.value)}
                      >
                        <Text style={[styles.languageChipText, active ? styles.languageChipTextActive : undefined]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Bio</Text>
                <TextInput
                  value={editForm.bio}
                  onChangeText={(value) => updateEditField("bio", value)}
                  style={[styles.input, styles.inputMultiline]}
                  placeholder="Tell people a little about yourself"
                  placeholderTextColor={colors.mutedText}
                  multiline
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Learning goal</Text>
                <TextInput
                  value={editForm.learningGoal}
                  onChangeText={(value) => updateEditField("learningGoal", value)}
                  style={[styles.input, styles.inputMultiline]}
                  placeholder="What are you trying to achieve?"
                  placeholderTextColor={colors.mutedText}
                  multiline
                />
              </View>
            </ScrollView>

            <View style={styles.editModalFooter}>
              <Pressable
                style={styles.editModalSecondaryButton}
                onPress={() => setIsEditProfileOpen(false)}
                disabled={savingProfile}
              >
                <Text style={styles.editModalSecondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.editModalPrimaryButton}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                <Text style={styles.editModalPrimaryButtonText}>
                  {savingProfile ? "Saving..." : "Save changes"}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
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
      fontSize: 28,
      fontFamily: fontFamilies.displayBold,
    },
    settingsButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
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
      color: colors.text,
      fontFamily: fontFamilies.displayBold,
      marginBottom: 12,
      textTransform: "capitalize",
    },
    editButton: {
      backgroundColor: colors.navy,
      borderRadius: 999,
      paddingHorizontal: 18,
      paddingVertical: 10,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.1,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    editButtonText: {
      color: "#fff",
      fontSize: 16,
      fontFamily: fontFamilies.bodyBold,
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
      fontSize: 12,
      fontFamily: fontFamilies.bodyBold,
    },
    editModalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(8, 19, 32, 0.46)",
      justifyContent: "flex-end",
    },
    editModalBackdropTouchable: {
      flex: 1,
    },
    editModalSheet: {
      maxHeight: "88%",
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 20,
      gap: 14,
    },
    editModalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
    },
    editModalEyebrow: {
      color: colors.link,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 1.1,
      fontFamily: fontFamilies.displayBold,
    },
    editModalTitle: {
      marginTop: 4,
      color: colors.text,
      fontSize: 28,
      fontFamily: fontFamilies.displayBold,
    },
    editModalCloseButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    editModalContent: {
      gap: 16,
      paddingBottom: 8,
    },
    inputGroup: {
      gap: 8,
    },
    inputLabel: {
      color: colors.text,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
    },
    input: {
      minHeight: 52,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 15,
      fontFamily: fontFamilies.bodyMedium,
    },
    inputMultiline: {
      minHeight: 104,
      textAlignVertical: "top",
    },
    languageChips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    languageChip: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    languageChipActive: {
      backgroundColor: colors.navy,
      borderColor: colors.navy,
    },
    languageChipText: {
      color: colors.text,
      fontSize: 13,
      fontFamily: fontFamilies.bodySemiBold,
    },
    languageChipTextActive: {
      color: "#fff",
    },
    editModalFooter: {
      flexDirection: "row",
      gap: 10,
    },
    editModalSecondaryButton: {
      flex: 1,
      minHeight: 50,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    editModalSecondaryButtonText: {
      color: colors.text,
      fontSize: 15,
      fontFamily: fontFamilies.bodyBold,
    },
    editModalPrimaryButton: {
      flex: 1.2,
      minHeight: 50,
      borderRadius: 16,
      backgroundColor: colors.navy,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    editModalPrimaryButtonText: {
      color: "#fff",
      fontSize: 15,
      fontFamily: fontFamilies.bodyExtraBold,
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
