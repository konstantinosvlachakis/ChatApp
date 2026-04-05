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
import CountryFlag from "react-native-country-flag";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getCoachLanguageOptions } from "../features/coachConversation";
import { fetchProfile, updateProfile, uploadProfilePhoto } from "../services/api/auth";
import type { Profile } from "../types";
import type { ThemeColors } from "../theme/colors";
import { API_BASE_URL } from "../config/api";
import type { ProfilePhotoSlot } from "../services/api/auth";
import { fontFamilies } from "../theme/typography";

const AVATAR_RING_OPTIONS = [
  { value: "#1b7f79", label: "Teal" },
  { value: "#177f8d", label: "Ocean" },
  { value: "#2b5dff", label: "Blue" },
  { value: "#a499e4", label: "Lavender" },
  { value: "#6b7a90", label: "Slate" },
  { value: "#ecb1d0", label: "Blush" },
  { value: "#d95b70", label: "Rose" },
  { value: "#f08aa6", label: "Pink" },
  { value: "#d7b054", label: "Gold" },
  { value: "#ef8b3a", label: "Apricot" },
  { value: "#57c2a2", label: "Mint" },
  { value: "#228b67", label: "Forest" },
];

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

const LANGUAGE_ISO_MAP: Record<string, string> = {
  arabic: "sa",
  chinese: "cn",
  dutch: "nl",
  english: "gb",
  french: "fr",
  german: "de",
  greek: "gr",
  hindi: "in",
  italian: "it",
  japanese: "jp",
  korean: "kr",
  portuguese: "pt",
  russian: "ru",
  spanish: "es",
  swedish: "se",
  turkish: "tr",
  ukrainian: "ua",
};

const PRACTICE_LEVELS = [
  {
    value: "beginner",
    cefr: "A2",
    title: "Brave Beginner",
    missionLabel: "Elementary Mission",
    subtitle: "You are building comfort one chat at a time.",
    signal: 2,
  },
  {
    value: "intermediate",
    cefr: "B1",
    title: "Conversation Surfer",
    missionLabel: "Intermediate Mission",
    subtitle: "You can ride through longer back-and-forth exchanges.",
    signal: 3,
  },
  {
    value: "advanced",
    cefr: "C1",
    title: "Accent Adventurer",
    missionLabel: "Advanced Mission",
    subtitle: "You are exploring rhythm, slang, and natural phrasing.",
    signal: 4,
  },
  {
    value: "fluent",
    cefr: "C2",
    title: "Fluency Chaser",
    missionLabel: "Mastery Mission",
    subtitle: "You are polishing confidence and flow every week.",
    signal: 5,
  },
];

const isValidHexColor = (value = "") => /^#[0-9a-fA-F]{6}$/.test(String(value).trim());

function getLanguageFlag(language?: string | null) {
  if (!language) return "🌍";
  return LANGUAGE_FLAG_MAP[language.trim().toLowerCase()] || "🌍";
}

function getLanguageIsoCode(language?: string | null) {
  if (!language) return null;
  return LANGUAGE_ISO_MAP[language.trim().toLowerCase()] || null;
}

function getPracticeLevelMeta(level?: string | null) {
  const normalized = String(level || "beginner").trim().toLowerCase();
  return PRACTICE_LEVELS.find((item) => item.value === normalized) || PRACTICE_LEVELS[0];
}

function getPracticeLevelTone(level: string, colors: ThemeColors) {
  switch (level) {
    case "intermediate":
      return {
        panel: "#EAF3FC",
        panelBorder: "#D2E4F7",
        glow: "#DCECFB",
        chip: "#F4F9FE",
        text: "#1766B1",
        muted: "#5D7FA2",
      };
    case "advanced":
      return {
        panel: "#EEF8F3",
        panelBorder: "#D3ECDD",
        glow: "#E0F3E7",
        chip: "#F6FCF8",
        text: "#24724D",
        muted: "#5E8C74",
      };
    case "fluent":
      return {
        panel: "#F5F1FF",
        panelBorder: "#E1D7F7",
        glow: "#ECE5FD",
        chip: "#FAF7FF",
        text: "#6B54B5",
        muted: "#8471BD",
      };
    case "beginner":
    default:
      return {
        panel: "#F8F2EA",
        panelBorder: "#EADCC7",
        glow: "#F5EAD9",
        chip: "#FCF8F1",
        text: "#A66A12",
        muted: "#A78A5C",
      };
  }
}

function getMissionBadgeOptions(level: string) {
  switch (level) {
    case "intermediate":
      return [
        { label: "Conversation Surfer", active: true },
        { label: "Accent Adventurer", active: false },
      ];
    case "advanced":
      return [
        { label: "Accent Adventurer", active: true },
        { label: "Fluency Chaser", active: false },
      ];
    case "fluent":
      return [
        { label: "Fluency Chaser", active: true },
        { label: "Linguistic Master", active: false },
      ];
    case "beginner":
    default:
      return [
        { label: "Brave Beginner", active: true },
        { label: "Conversation Surfer", active: false },
      ];
  }
}

export function ProfileScreen() {
  const { user: authUser, refreshProfile } = useAuth();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [user, setUser] = useState<Profile | null>(authUser);
  const [loading, setLoading] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<ProfilePhotoSlot | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isMissionCatalogOpen, setIsMissionCatalogOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [addingMissionLanguage, setAddingMissionLanguage] = useState<string | null>(null);
  const [removingMissionLanguage, setRemovingMissionLanguage] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const previewScrollRef = useRef<ScrollView | null>(null);
  const languageOptions = React.useMemo(() => getCoachLanguageOptions(user), [user]);
  const [editForm, setEditForm] = useState({
    username: "",
    email: "",
    location: "",
    nativeLanguage: "english",
    baseLanguage: "english",
    practiceLanguages: [] as string[],
    practiceLanguageLevels: {} as Record<string, string>,
    bio: "",
    learningGoal: "",
    avatarRingColor: "#1b7f79",
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
      practiceLanguages:
        user?.languages_practicing?.length
          ? user.languages_practicing.map((language) => String(language).trim().toLowerCase())
          : [],
      practiceLanguageLevels: Object.fromEntries(
        Object.entries(user?.practice_language_levels || {}).map(([language, level]) => [
          String(language).trim().toLowerCase(),
          String(level).trim().toLowerCase(),
        ])
      ),
      bio: user?.bio || "",
      learningGoal: user?.learning_goal || "",
      avatarRingColor: isValidHexColor(user?.avatar_ring_color || "")
        ? String(user?.avatar_ring_color).toLowerCase()
        : "#1b7f79",
    });
  }, [languageOptions, user]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
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
  const avatarRingColor = isValidHexColor(user?.avatar_ring_color || "")
    ? String(user?.avatar_ring_color).toLowerCase()
    : "#1b7f79";
  const complementaryOne = resolveMediaUrl(user?.complementary_image_1_url, false);
  const complementaryTwo = resolveMediaUrl(user?.complementary_image_2_url, false);
  const practicingLanguages = user?.languages_practicing || [];
  const complementaryCards: Array<{ key: ProfilePhotoSlot; image: string }> = [
    { key: "complementary_1", image: complementaryOne },
    { key: "complementary_2", image: complementaryTwo },
  ];
  const previewImages = [profileImage, complementaryOne, complementaryTwo].filter(Boolean);
  const nativeLanguage = user?.native_language || "Not shared";
  const baseLanguage = user?.base_translate_language || nativeLanguage;
  const profileBio =
    user?.bio?.trim() || "Tell people a little about yourself so they know what kind of conversations you enjoy.";
  const learningGoalText =
    user?.learning_goal?.trim() ||
    "My goal is to become fluent and confident in new languages for both travel and communication.";
  const locationText = user?.location?.trim() || "Add your location";
  const ageLabel = typeof user?.age === "number" ? String(user.age) : null;
  const practiceLanguageCards = practicingLanguages.map((language, index) => {
    const level = getPracticeLevelMeta(user?.practice_language_levels?.[language]);
    const tone = getPracticeLevelTone(level.value, colors);
    const missionBadges = getMissionBadgeOptions(level.value);
    const isoCode = getLanguageIsoCode(language);
    return {
      language,
      flag: getLanguageFlag(language),
      isoCode,
      levelValue: level.value,
      levelCode: level.cefr,
      levelTitle: level.title,
      missionLabel: level.missionLabel,
      levelSubtitle: level.subtitle,
      signal: level.signal,
      tone,
      missionBadges,
    };
  });
  const missionCatalogOptions = languageOptions
    .filter((option) => !practicingLanguages.includes(option.value))
    .map((option, index) => ({
      ...option,
      isoCode: getLanguageIsoCode(option.value),
      palette: getPracticeLevelTone(index % 2 === 0 ? "beginner" : "intermediate", colors),
      description:
        index % 2 === 0
          ? "Begin with warm-up prompts, guided intros, and simple daily speaking loops."
          : "Build momentum with everyday conversations, travel roleplay, and confidence drills.",
    }));

  const updateEditField = (field: keyof typeof editForm, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const renderLanguageChoiceContent = (
    label: string,
    active = false,
    flagSize = 16
  ) => {
    const flagNode = (() => {
      const isoCode = getLanguageIsoCode(label);
      if (isoCode) {
        return (
          <View style={styles.languageChipFlagWrap}>
            <CountryFlag isoCode={isoCode} size={flagSize} />
          </View>
        );
      }
      return (
        <Text style={[styles.languageChipEmoji, active ? styles.languageChipEmojiActive : undefined]}>
          {getLanguageFlag(label)}
        </Text>
      );
    })();

    return (
      <View style={styles.languageChipContent}>
        {flagNode}
        <Text style={[styles.languageChipText, active ? styles.languageChipTextActive : undefined]}>
          {label}
        </Text>
      </View>
    );
  };

  const renderLanguageFlagOnly = (label: string, flagSize = 18) => {
    const isoCode = getLanguageIsoCode(label);
    if (isoCode) {
      return (
        <View style={styles.languageChipFlagWrap}>
          <CountryFlag isoCode={isoCode} size={flagSize} />
        </View>
      );
    }
    return <Text style={styles.languageChipEmoji}>{getLanguageFlag(label)}</Text>;
  };

  const togglePracticeLanguage = (language: string) => {
    const normalizedLanguage = language.trim().toLowerCase();
    setEditForm((prev) => {
      const exists = prev.practiceLanguages.includes(normalizedLanguage);
      if (exists) {
        const nextLevels = { ...prev.practiceLanguageLevels };
        delete nextLevels[normalizedLanguage];
        return {
          ...prev,
          practiceLanguages: prev.practiceLanguages.filter((item) => item !== normalizedLanguage),
          practiceLanguageLevels: nextLevels,
        };
      }
      return {
        ...prev,
        practiceLanguages: [...prev.practiceLanguages, normalizedLanguage],
        practiceLanguageLevels: {
          ...prev.practiceLanguageLevels,
          [normalizedLanguage]: prev.practiceLanguageLevels[normalizedLanguage] || "beginner",
        },
      };
    });
  };

  const updatePracticeLanguageLevel = (language: string, level: string) => {
    const normalizedLanguage = language.trim().toLowerCase();
    setEditForm((prev) => ({
      ...prev,
      practiceLanguageLevels: {
        ...prev.practiceLanguageLevels,
        [normalizedLanguage]: level,
      },
    }));
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
        languages_practicing: editForm.practiceLanguages,
        practice_language_levels: Object.fromEntries(
          editForm.practiceLanguages.map((language) => [
            language,
            editForm.practiceLanguageLevels[language] || "beginner",
          ])
        ),
        bio: editForm.bio.trim(),
        learning_goal: editForm.learningGoal.trim(),
        avatar_ring_color: isValidHexColor(editForm.avatarRingColor)
          ? editForm.avatarRingColor.toLowerCase()
          : "#1b7f79",
      });
      const mergedProfile = { ...user, ...payload } as Profile;
      setUser(mergedProfile);
      refreshProfile().catch(() => {});
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

  const handleAddMissionLanguage = async (language: string) => {
    if (!user || addingMissionLanguage) return;
    const normalizedLanguage = language.trim().toLowerCase();
    if (practicingLanguages.includes(normalizedLanguage)) {
      setIsMissionCatalogOpen(false);
      return;
    }

    const nextLanguages = [...practicingLanguages, normalizedLanguage];
    const nextLevels = {
      ...(user.practice_language_levels || {}),
      [normalizedLanguage]: user.practice_language_levels?.[normalizedLanguage] || "beginner",
    };

    setAddingMissionLanguage(normalizedLanguage);
    try {
      const payload = await updateProfile({
        languages_practicing: nextLanguages,
        practice_language_levels: nextLevels,
      });
      setUser((prev) => (prev ? ({ ...prev, ...payload } as Profile) : prev));
      setEditForm((prev) => ({
        ...prev,
        practiceLanguages: nextLanguages,
        practiceLanguageLevels: {
          ...prev.practiceLanguageLevels,
          [normalizedLanguage]: prev.practiceLanguageLevels[normalizedLanguage] || "beginner",
        },
      }));
      refreshProfile().catch(() => {});
      setIsMissionCatalogOpen(false);
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        "Could not add this mission right now.";
      Alert.alert("Mission not added", message);
    } finally {
      setAddingMissionLanguage(null);
    }
  };

  const handleRemoveMissionLanguage = async (language: string) => {
    if (!user || removingMissionLanguage) return;
    const normalizedLanguage = language.trim().toLowerCase();
    const nextLanguages = practicingLanguages.filter((item) => item !== normalizedLanguage);
    const nextLevels = { ...(user.practice_language_levels || {}) };
    delete nextLevels[normalizedLanguage];

    setRemovingMissionLanguage(normalizedLanguage);
    try {
      const payload = await updateProfile({
        languages_practicing: nextLanguages,
        practice_language_levels: nextLevels,
      });
      setUser((prev) => (prev ? ({ ...prev, ...payload } as Profile) : prev));
      setEditForm((prev) => {
        const draftLevels = { ...prev.practiceLanguageLevels };
        delete draftLevels[normalizedLanguage];
        return {
          ...prev,
          practiceLanguages: nextLanguages,
          practiceLanguageLevels: draftLevels,
        };
      });
      refreshProfile().catch(() => {});
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        "Could not remove this mission right now.";
      Alert.alert("Mission not removed", message);
    } finally {
      setRemovingMissionLanguage(null);
    }
  };

  const handleExploreMissionPeople = (language: string) => {
    navigation.navigate("People", {
      screen: "CommunityHome",
      params: {
        prefillLanguage: language,
        fromMissionAt: Date.now(),
      },
    });
  };

  const openMissionActions = (language: string) => {
    Alert.alert(
      `${language} mission`,
      "Choose what you want to do with this mission.",
      [
        {
          text: "Find people",
          onPress: () => handleExploreMissionPeople(language),
        },
        {
          text: "Delete mission",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "Delete mission?",
              `Remove ${language} from your active missions? You can always add it again from the catalog.`,
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => handleRemoveMissionLanguage(language),
                },
              ]
            ),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.pageEyebrow}>YOUR SPACE</Text>
            <Text style={styles.pageTitle}>Profile</Text>
          </View>
          <Pressable style={styles.settingsButton} onPress={() => navigation.navigate("Settings")}>
            <Ionicons name="settings-outline" size={20} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroGlowPrimary} />
          <View style={styles.heroGlowSecondary} />
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
              <Image source={{ uri: profileImage }} style={[styles.avatar, { borderColor: avatarRingColor }]} />
            </Pressable>
            <View style={styles.heroIdentity}>
              <View style={styles.heroEyebrowRow}>
                <Text style={styles.heroEyebrow}>PERSONAL PROFILE</Text>
                <View style={styles.heroStatusPill}>
                  <View style={styles.heroStatusDot} />
                  <Text style={styles.heroStatusText}>Ready to connect</Text>
                </View>
              </View>
              <Text style={styles.heroTitle}>
                {user?.username || "Profile"}
                {ageLabel ? `, ${ageLabel}` : ""}
              </Text>
              <Text style={styles.heroSubtitle}>
                Native in {nativeLanguage}{"\n"}{locationText}
              </Text>
            </View>
          </View>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCard}>
              <View style={styles.heroStatIconWrap}>
                <Text style={styles.heroStatIcon}>{getLanguageFlag(nativeLanguage)}</Text>
              </View>
              <Text style={styles.heroStatLabel}>Native</Text>
              <Text style={styles.heroStatValue} numberOfLines={1}>
                {nativeLanguage}
              </Text>
            </View>
            <View style={styles.heroStatCard}>
              <View style={styles.heroStatIconWrap}>
                <Ionicons name="swap-horizontal-outline" size={15} color={colors.primary} />
              </View>
              <Text style={styles.heroStatLabel}>Base</Text>
              <Text style={styles.heroStatValue} numberOfLines={1}>
                {baseLanguage}
              </Text>
            </View>
            <View style={styles.heroStatCard}>
              <View style={styles.heroStatIconWrap}>
                <Ionicons name="radio-outline" size={15} color={colors.primary} />
              </View>
              <Text style={styles.heroStatLabel}>Active</Text>
              <Text style={styles.heroStatValue}>
                {practicingLanguages.length || 0}
              </Text>
            </View>
          </View>

          <View style={styles.heroActionRow}>
            <Pressable
              style={styles.editButton}
              onPress={() => setIsEditProfileOpen(true)}
            >
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={styles.editButtonText}>Edit profile</Text>
            </Pressable>
            <Pressable
              style={styles.photosButton}
              onPress={() => onUploadPhoto("profile")}
              disabled={Boolean(uploadingSlot)}
            >
              <Ionicons name="images-outline" size={16} color={colors.text} />
              <Text style={styles.photosButtonText}>
                {uploadingSlot === "profile" ? "Uploading..." : "Update photo"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.sectionSubtitle}>What people learn about you first</Text>
            </View>
          </View>
          <Text style={styles.bioLead}>{profileBio}</Text>
          <View style={styles.aboutAccentCard}>
            <Text style={styles.aboutAccentLabel}>Conversation vibe</Text>
            <Text style={styles.aboutAccentText}>
              {user?.learning_goal?.trim()
                ? "You come across as focused, intentional, and motivated to improve."
                : "You feel approachable, open-minded, and ready for regular conversation practice."}
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.missionSectionHeader}>
            <View style={styles.missionSectionBrandRow}>
              <Ionicons name="globe-outline" size={18} color={colors.primary} />
              <Text style={styles.missionSectionBrandText}>Curated Scholar</Text>
            </View>
            <View style={styles.missionSectionHeaderMain}>
              <Text style={styles.missionSectionTitle}>Active Missions</Text>
              <Text style={styles.missionSectionCrumb}>PROFILE / LANGUAGES</Text>
            </View>
            <Text style={styles.missionSectionSubtitle}>
              Elevate your linguistic precision through curated editorial paths.
            </Text>
          </View>
          {practiceLanguageCards.length ? (
            <View style={styles.languageCardsColumn}>
              {practiceLanguageCards.map((item, index) => (
                <View
                  key={item.language}
                  style={[
                    styles.practiceLanguageRow,
                    {
                      borderColor: item.tone.panelBorder,
                      backgroundColor: item.tone.chip,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.practiceLanguageGlow,
                      { backgroundColor: item.tone.glow },
                    ]}
                  />
                  <View style={styles.practiceLanguageTopMeta}>
                    <View
                      style={[
                        styles.practiceLanguageMissionTag,
                        { backgroundColor: item.tone.panel },
                      ]}
                    >
                      <Text style={[styles.practiceLanguageMissionTagText, { color: item.tone.text }]}>
                        Mission {String(index + 1).padStart(2, "0")}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.practiceLanguageLevelBadge,
                        {
                          backgroundColor: item.tone.panel,
                          borderColor: item.tone.panelBorder,
                        },
                      ]}
                    >
                      <Text style={[styles.practiceLanguageLevelBadgeCode, { color: item.tone.text }]}>
                        {item.levelCode}
                      </Text>
                      <Text style={[styles.practiceLanguageLevelBadgeLabel, { color: item.tone.text }]}>
                        {item.levelTitle}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.practiceLanguageHeader}>
                    <View style={styles.practiceLanguageIdentity}>
                      <View
                        style={[
                          styles.practiceLanguageFlagWrap,
                          {
                            backgroundColor: item.tone.panel,
                            borderColor: item.tone.panelBorder,
                          },
                        ]}
                      >
                        {item.isoCode ? (
                          <CountryFlag isoCode={item.isoCode} size={26} />
                        ) : (
                          <Text style={styles.practiceLanguageFlag}>{item.flag}</Text>
                        )}
                      </View>
                      <View style={styles.practiceLanguageMain}>
                        <Text style={styles.practiceLanguageName}>{item.language}</Text>
                        <View style={styles.practiceLanguageMissionMeta}>
                          <View
                            style={[
                              styles.practiceLanguageMissionDot,
                              { backgroundColor: item.tone.text },
                            ]}
                          />
                          <Text style={styles.practiceLanguageMissionText}>
                            {item.missionLabel}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Pressable
                      style={styles.practiceLanguageMenuButton}
                      onPress={() => openMissionActions(item.language)}
                    >
                      <Ionicons name="ellipsis-vertical" size={14} color={colors.mutedText} />
                    </Pressable>
                  </View>

                  <Text style={styles.practiceLanguageSubtitle}>{item.levelSubtitle}</Text>
                  <Pressable
                    style={styles.missionPeopleButton}
                    onPress={() => handleExploreMissionPeople(item.language)}
                    disabled={removingMissionLanguage === item.language}
                  >
                    <Ionicons name="people-outline" size={15} color="#fff" />
                    <Text style={styles.missionPeopleButtonText}>
                      Let&apos;s explore people for this mission
                    </Text>
                  </Pressable>
                  <View style={styles.missionBadgeRow}>
                    {item.missionBadges.map((badge) => (
                      <View
                        key={`${item.language}-${badge.label}`}
                        style={[
                          styles.missionBadge,
                          badge.active
                            ? [styles.missionBadgeActive, { backgroundColor: item.tone.panel, borderColor: item.tone.panelBorder }]
                            : styles.missionBadgeMuted,
                        ]}
                      >
                        <Ionicons
                          name={badge.active ? "checkmark-circle" : "lock-closed"}
                          size={12}
                          color={badge.active ? item.tone.text : colors.mutedText}
                        />
                        <Text
                          style={[
                            styles.missionBadgeText,
                            badge.active
                              ? [styles.missionBadgeTextActive, { color: item.tone.text }]
                              : styles.missionBadgeTextMuted,
                          ]}
                        >
                          {badge.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyLanguageState}>
              <Text style={styles.emptyLanguageTitle}>No active language missions yet</Text>
              <Text style={styles.emptyLanguageText}>
                Add a practice language to make your profile feel more alive to other learners.
              </Text>
            </View>
          )}

          <Pressable style={styles.missionCatalogCard} onPress={() => setIsMissionCatalogOpen(true)}>
            <View style={styles.missionCatalogGlowPrimary} />
            <View style={styles.missionCatalogGlowSecondary} />
            <View style={styles.missionCatalogPlusWrap}>
              <Ionicons name="add" size={28} color={colors.navy} />
            </View>
            <Text style={styles.missionCatalogTitle}>Begin a New Mission</Text>
            <Text style={styles.missionCatalogText}>
              Expand your curated collection of languages with guided paths designed around your confidence level.
            </Text>
            <View style={styles.missionCatalogButton}>
              <Text style={styles.missionCatalogButtonText}>Explore Catalog</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="rocket-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionTitle}>Learning Goal</Text>
              <Text style={styles.sectionSubtitle}>The direction you are moving toward</Text>
            </View>
          </View>
          <Text style={styles.goalQuoteMark}>“</Text>
          <Text style={styles.goalText}>{learningGoalText}</Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="images-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionTitle}>Photo Moments</Text>
              <Text style={styles.sectionSubtitle}>Add more context to your profile</Text>
            </View>
          </View>

          <View style={styles.complementaryRow}>
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
              ) : (
                <View style={styles.photoBadge}>
                  <Text style={styles.photoBadgeText}>Main</Text>
                </View>
              )}
            </Pressable>
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
                ) : (
                  <View style={styles.photoBadge}>
                    <Text style={styles.photoBadgeText}>
                      {card.key === "complementary_1" ? "Extra 1" : "Extra 2"}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.footerSpacer} />
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
            <Pressable
              style={styles.editModalBackdropTouchable}
              onPress={() => {
                setIsEditProfileOpen(false);
              }}
            />
          <View style={styles.editModalSheet}>
            <View style={styles.editModalHeader}>
              <View>
                <Text style={styles.editModalEyebrow}>Profile</Text>
                <Text style={styles.editModalTitle}>Edit profile</Text>
              </View>
              <Pressable
                style={styles.editModalCloseButton}
                onPress={() => {
                  setIsEditProfileOpen(false);
                }}
              >
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
                        {renderLanguageChoiceContent(option.label, active)}
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
                        {renderLanguageChoiceContent(option.label, active)}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Practice languages</Text>
                <View style={styles.languageChips}>
                  {languageOptions.map((option) => {
                    const active = editForm.practiceLanguages.includes(option.value);
                    return (
                      <Pressable
                        key={`practice-${option.value}`}
                        style={[styles.languageChip, active ? styles.languageChipActive : undefined]}
                        onPress={() => togglePracticeLanguage(option.value)}
                      >
                        {renderLanguageChoiceContent(option.label, active)}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {editForm.practiceLanguages.length ? (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Mission levels</Text>
                  <View style={styles.levelEditorStack}>
                    {editForm.practiceLanguages.map((language) => {
                      const activeLevel =
                        editForm.practiceLanguageLevels[language] || "beginner";
                      return (
                        <View
                          key={`level-${language}`}
                          style={styles.levelEditorCard}
                        >
                          <View style={styles.levelEditorHeader}>
                            <View style={styles.levelEditorLanguageWrap}>
                              {renderLanguageFlagOnly(language, 18)}
                              <Text style={styles.levelEditorLanguage}>{language}</Text>
                            </View>
                            <Text style={styles.levelEditorHint}>Tune the mission</Text>
                          </View>
                          <View style={styles.levelOptionRow}>
                            {PRACTICE_LEVELS.map((level) => {
                              const selected = activeLevel === level.value;
                              return (
                                <Pressable
                                  key={`${language}-${level.value}`}
                                  style={[
                                    styles.levelOptionChip,
                                    selected ? styles.levelOptionChipActive : undefined,
                                  ]}
                                  onPress={() =>
                                    updatePracticeLanguageLevel(language, level.value)
                                  }
                                >
                                  <Text
                                    style={[
                                      styles.levelOptionChipText,
                                      selected ? styles.levelOptionChipTextActive : undefined,
                                    ]}
                                  >
                                    {level.title}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}

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

              <View style={styles.avatarAccentCard}>
                <View style={styles.avatarAccentPreviewRow}>
                  <View
                    style={[
                      styles.avatarAccentPreview,
                      { borderColor: isValidHexColor(editForm.avatarRingColor) ? editForm.avatarRingColor : "#1b7f79" },
                    ]}
                  >
                    <Image source={{ uri: profileImage }} style={styles.avatarAccentPreviewImage} />
                  </View>
                  <View style={styles.avatarAccentTextWrap}>
                    <Text style={styles.avatarAccentTitle}>Avatar ring color</Text>
                    <Text style={styles.avatarAccentDescription}>
                      Pick a personal accent for your profile photo. It updates your profile ring when you save.
                    </Text>
                    <Text style={styles.avatarAccentCode}>
                      {isValidHexColor(editForm.avatarRingColor)
                        ? editForm.avatarRingColor.toLowerCase()
                        : "Enter a valid hex color"}
                    </Text>
                  </View>
                </View>

                <View style={styles.avatarAccentPickerCard}>
                  <Text style={styles.avatarAccentSectionLabel}>Custom color</Text>
                  <TextInput
                    value={editForm.avatarRingColor}
                    onChangeText={(value) => updateEditField("avatarRingColor", value.replace(/\s+/g, ""))}
                    style={[
                      styles.avatarAccentHexInput,
                      editForm.avatarRingColor.length > 0 &&
                      !isValidHexColor(editForm.avatarRingColor)
                        ? styles.avatarAccentHexInputInvalid
                        : undefined,
                    ]}
                    placeholder="#1b7f79"
                    placeholderTextColor={colors.mutedText}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={7}
                  />
                  {editForm.avatarRingColor.length > 0 &&
                  !isValidHexColor(editForm.avatarRingColor) ? (
                    <Text style={styles.avatarAccentError}>
                      Use a full hex color like #1b7f79.
                    </Text>
                  ) : null}

                  <Text style={styles.avatarAccentSectionLabel}>Color palette</Text>
                  <View style={styles.avatarAccentSwatches}>
                    {AVATAR_RING_OPTIONS.map((option) => {
                      const active = editForm.avatarRingColor.toLowerCase() === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          style={[
                            styles.avatarAccentSwatchButton,
                            active ? styles.avatarAccentSwatchButtonActive : undefined,
                          ]}
                          onPress={() => updateEditField("avatarRingColor", option.value)}
                        >
                          <View style={[styles.avatarAccentSwatch, { backgroundColor: option.value }]} />
                          <Text style={styles.avatarAccentSwatchLabel}>{option.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
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

      <Modal
        visible={isMissionCatalogOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsMissionCatalogOpen(false)}
      >
        <View style={styles.catalogBackdrop}>
          <Pressable style={styles.catalogBackdropTouchable} onPress={() => setIsMissionCatalogOpen(false)} />
          <View style={styles.catalogSheet}>
            <View style={styles.catalogHandle} />
            <View style={styles.catalogHeader}>
              <View style={styles.catalogHeaderIcon}>
                <Ionicons name="library-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.catalogHeaderCopy}>
                <Text style={styles.catalogEyebrow}>Mission Catalog</Text>
                <Text style={styles.catalogTitle}>Choose your next language path</Text>
                <Text style={styles.catalogSubtitle}>
                  Start a fresh mission and we will drop it straight into your active collection.
                </Text>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.catalogList} showsVerticalScrollIndicator={false}>
              {missionCatalogOptions.length ? (
                missionCatalogOptions.map((option, index) => (
                  <View
                    key={`catalog-${option.value}`}
                    style={[
                      styles.catalogCard,
                      {
                        backgroundColor: option.palette.chip,
                        borderColor: option.palette.panelBorder,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.catalogCardGlow,
                        { backgroundColor: option.palette.glow },
                      ]}
                    />
                    <View style={styles.catalogCardHeader}>
                      <View style={styles.catalogLanguageWrap}>
                        <View
                          style={[
                            styles.catalogFlagWrap,
                            {
                              backgroundColor: option.palette.panel,
                              borderColor: option.palette.panelBorder,
                            },
                          ]}
                        >
                          {option.isoCode ? (
                            <CountryFlag isoCode={option.isoCode} size={24} />
                          ) : (
                            <Text style={styles.catalogFlagEmoji}>{getLanguageFlag(option.value)}</Text>
                          )}
                        </View>
                        <View style={styles.catalogLanguageCopy}>
                          <Text style={styles.catalogLanguageName}>{option.label}</Text>
                          <Text style={styles.catalogLanguageMeta}>
                            {index % 2 === 0 ? "Starter mission" : "Momentum mission"}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.catalogLevelChip,
                          {
                            backgroundColor: option.palette.panel,
                            borderColor: option.palette.panelBorder,
                          },
                        ]}
                      >
                        <Text style={[styles.catalogLevelChipCode, { color: option.palette.text }]}>A2</Text>
                      </View>
                    </View>

                    <Text style={styles.catalogDescription}>{option.description}</Text>

                    <View style={styles.catalogTagsRow}>
                      <View style={[styles.catalogTag, { backgroundColor: option.palette.panel }]}>
                        <Text style={[styles.catalogTagText, { color: option.palette.text }]}>Guided prompts</Text>
                      </View>
                      <View style={[styles.catalogTag, { backgroundColor: option.palette.panel }]}>
                        <Text style={[styles.catalogTagText, { color: option.palette.text }]}>Confidence first</Text>
                      </View>
                    </View>

                    <Pressable
                      style={styles.catalogAddButton}
                      onPress={() => handleAddMissionLanguage(option.value)}
                      disabled={addingMissionLanguage === option.value}
                    >
                      <Text style={styles.catalogAddButtonText}>
                        {addingMissionLanguage === option.value ? "Adding..." : "Add Mission"}
                      </Text>
                    </Pressable>
                  </View>
                ))
              ) : (
                <View style={styles.catalogEmptyState}>
                  <Text style={styles.catalogEmptyTitle}>Your catalog is fully active</Text>
                  <Text style={styles.catalogEmptyText}>
                    You have already added every available language mission in this profile flow.
                  </Text>
                </View>
              )}
            </ScrollView>
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
    content: { padding: 16, gap: 14 },
    topBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 2,
    },
    pageEyebrow: {
      color: colors.link,
      fontSize: 11,
      letterSpacing: 1.4,
      fontFamily: fontFamilies.bodyBold,
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
      borderRadius: 26,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      overflow: "hidden",
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 5,
    },
    heroGlowPrimary: {
      position: "absolute",
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: colors.overlayTint,
      top: -92,
      right: -52,
    },
    heroGlowSecondary: {
      position: "absolute",
      width: 130,
      height: 130,
      borderRadius: 65,
      backgroundColor: `${colors.primary}12`,
      bottom: -30,
      left: -30,
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
      color: colors.text,
      fontFamily: fontFamilies.displayBold,
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
      gap: 8,
      marginTop: 18,
    },
    heroStatCard: {
      flex: 1,
      borderRadius: 16,
      backgroundColor: "rgba(255,255,255,0.56)",
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      paddingHorizontal: 10,
      minHeight: 84,
    },
    heroStatIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.62)",
      marginBottom: 10,
    },
    heroStatIcon: {
      fontSize: 15,
    },
    heroStatValue: {
      color: colors.text,
      fontSize: 16,
      fontFamily: fontFamilies.displayBold,
      textTransform: "capitalize",
    },
    heroStatLabel: {
      color: colors.mutedText,
      fontSize: 10,
      marginBottom: 5,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      fontFamily: fontFamilies.bodyBold,
    },
    heroActionRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 16,
    },
    editButton: {
      flex: 1,
      minHeight: 50,
      backgroundColor: colors.navy,
      borderRadius: 18,
      paddingHorizontal: 18,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.1,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    editButtonText: {
      color: "#fff",
      fontSize: 15,
      fontFamily: fontFamilies.bodyBold,
    },
    photosButton: {
      flex: 1,
      minHeight: 50,
      borderRadius: 18,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    photosButtonText: {
      color: colors.text,
      fontSize: 15,
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
    missionSectionHeader: {
      gap: 10,
      marginBottom: 4,
    },
    missionSectionBrandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    missionSectionBrandText: {
      color: colors.text,
      fontSize: 13,
      fontFamily: fontFamilies.displaySemiBold,
    },
    missionSectionHeaderMain: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
    },
    missionSectionTitle: {
      color: colors.text,
      fontSize: 24,
      fontFamily: fontFamilies.displayBold,
    },
    missionSectionCrumb: {
      color: colors.mutedText,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      fontFamily: fontFamilies.bodyBold,
    },
    missionSectionSubtitle: {
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 21,
      maxWidth: 260,
      fontFamily: fontFamilies.bodyMedium,
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
      gap: 14,
      marginTop: 6,
    },
    practiceLanguageRow: {
      borderRadius: 22,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 15,
      gap: 12,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.07,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 3,
      overflow: "hidden",
      position: "relative",
    },
    practiceLanguageGlow: {
      position: "absolute",
      width: 124,
      height: 124,
      borderRadius: 62,
      top: -48,
      right: -38,
      opacity: 0.65,
    },
    practiceLanguageTopMeta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    practiceLanguageMissionTag: {
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: "transparent",
      alignSelf: "flex-start",
    },
    practiceLanguageMissionTagText: {
      fontSize: 10,
      letterSpacing: 1,
      textTransform: "uppercase",
      fontFamily: fontFamilies.bodyBold,
    },
    practiceLanguageLevelBadge: {
      minWidth: 84,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    practiceLanguageLevelBadgeCode: {
      fontSize: 24,
      lineHeight: 26,
      fontFamily: fontFamilies.displayBold,
    },
    practiceLanguageLevelBadgeLabel: {
      marginTop: 1,
      fontSize: 9,
      letterSpacing: 1,
      textTransform: "uppercase",
      fontFamily: fontFamilies.bodyBold,
    },
    practiceLanguageHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    practiceLanguageIdentity: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
      minWidth: 0,
    },
    practiceLanguageFlagWrap: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      overflow: "hidden",
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    practiceLanguageFlag: {
      fontSize: 24,
    },
    practiceLanguageMain: {
      flex: 1,
      minWidth: 0,
    },
    practiceLanguageName: {
      color: colors.text,
      fontSize: 22,
      fontFamily: fontFamilies.displayBold,
      textTransform: "capitalize",
      flexShrink: 1,
    },
    practiceLanguageMissionMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 2,
    },
    practiceLanguageMissionDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    practiceLanguageMissionText: {
      color: colors.mutedText,
      fontSize: 12,
      fontFamily: fontFamilies.bodySemiBold,
    },
    practiceLanguageMenuButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    practiceLanguageSubtitle: {
      color: colors.mutedText,
      fontSize: 14,
      lineHeight: 21,
      marginLeft: 62,
      marginRight: 4,
      fontFamily: fontFamilies.bodyMedium,
    },
    missionPeopleButton: {
      marginLeft: 62,
      minHeight: 42,
      borderRadius: 14,
      backgroundColor: colors.navy,
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },
    missionPeopleButtonText: {
      color: "#fff",
      fontSize: 13,
      fontFamily: fontFamilies.bodyBold,
      textAlign: "center",
    },
    missionBadgeRow: {
      flexDirection: "row",
      gap: 8,
      marginLeft: 62,
    },
    missionBadge: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 9,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      flex: 1,
    },
    missionBadgeActive: {
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.03,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    missionBadgeMuted: {
      backgroundColor: colors.surfaceMuted,
    },
    missionBadgeText: {
      color: colors.text,
      fontSize: 11,
      lineHeight: 13,
      fontFamily: fontFamilies.bodyBold,
      textTransform: "uppercase",
      flexShrink: 1,
    },
    missionBadgeTextActive: {
      letterSpacing: 0.3,
    },
    missionBadgeTextMuted: {
      color: colors.mutedText,
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
    missionCatalogCard: {
      marginTop: 8,
      borderRadius: 28,
      backgroundColor: colors.navy,
      minHeight: 248,
      paddingHorizontal: 24,
      paddingVertical: 26,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.14,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
      elevation: 4,
    },
    missionCatalogGlowPrimary: {
      position: "absolute",
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: `${colors.primary}25`,
      top: -92,
      right: -50,
    },
    missionCatalogGlowSecondary: {
      position: "absolute",
      width: 190,
      height: 190,
      borderRadius: 95,
      backgroundColor: `${colors.link}24`,
      bottom: -98,
      left: -48,
    },
    missionCatalogPlusWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: "#fff",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 18,
    },
    missionCatalogTitle: {
      color: "#fff",
      fontSize: 22,
      textAlign: "center",
      fontFamily: fontFamilies.displayBold,
    },
    missionCatalogText: {
      marginTop: 10,
      color: "rgba(255,255,255,0.82)",
      fontSize: 15,
      lineHeight: 24,
      textAlign: "center",
      fontFamily: fontFamilies.bodyMedium,
      maxWidth: 280,
    },
    missionCatalogButton: {
      marginTop: 24,
      minWidth: 214,
      borderRadius: 999,
      backgroundColor: "#fff",
      paddingHorizontal: 24,
      paddingVertical: 13,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "rgba(0,0,0,0.2)",
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },
    missionCatalogButtonText: {
      color: colors.navy,
      fontSize: 14,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      fontFamily: fontFamilies.bodyExtraBold,
    },
    catalogBackdrop: {
      flex: 1,
      backgroundColor: "rgba(8, 19, 32, 0.42)",
      justifyContent: "flex-end",
    },
    catalogBackdropTouchable: {
      flex: 1,
    },
    catalogSheet: {
      maxHeight: "82%",
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 18,
    },
    catalogHandle: {
      alignSelf: "center",
      width: 42,
      height: 5,
      borderRadius: 999,
      backgroundColor: colors.border,
      marginBottom: 14,
    },
    catalogHeader: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 16,
    },
    catalogHeaderIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    catalogHeaderCopy: {
      flex: 1,
    },
    catalogEyebrow: {
      color: colors.link,
      fontSize: 11,
      letterSpacing: 1.1,
      textTransform: "uppercase",
      fontFamily: fontFamilies.bodyBold,
      marginBottom: 4,
    },
    catalogTitle: {
      color: colors.text,
      fontSize: 25,
      lineHeight: 30,
      fontFamily: fontFamilies.displayBold,
    },
    catalogSubtitle: {
      color: colors.mutedText,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 6,
      fontFamily: fontFamilies.bodyMedium,
    },
    catalogList: {
      gap: 12,
      paddingBottom: 10,
    },
    catalogCard: {
      borderRadius: 22,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 16,
      overflow: "hidden",
      position: "relative",
      gap: 12,
    },
    catalogCardGlow: {
      position: "absolute",
      width: 126,
      height: 126,
      borderRadius: 63,
      top: -44,
      right: -34,
      opacity: 0.7,
    },
    catalogCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    catalogLanguageWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
      minWidth: 0,
    },
    catalogFlagWrap: {
      width: 46,
      height: 46,
      borderRadius: 23,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    catalogFlagEmoji: {
      fontSize: 24,
    },
    catalogLanguageCopy: {
      flex: 1,
      minWidth: 0,
    },
    catalogLanguageName: {
      color: colors.text,
      fontSize: 20,
      fontFamily: fontFamilies.displayBold,
    },
    catalogLanguageMeta: {
      color: colors.mutedText,
      fontSize: 12,
      marginTop: 3,
      fontFamily: fontFamilies.bodySemiBold,
    },
    catalogLevelChip: {
      minWidth: 58,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    catalogLevelChipCode: {
      fontSize: 20,
      lineHeight: 22,
      fontFamily: fontFamilies.displayBold,
    },
    catalogDescription: {
      color: colors.mutedText,
      fontSize: 14,
      lineHeight: 22,
      fontFamily: fontFamilies.bodyMedium,
    },
    catalogTagsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    catalogTag: {
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    catalogTagText: {
      fontSize: 11,
      fontFamily: fontFamilies.bodyBold,
    },
    catalogAddButton: {
      minHeight: 46,
      borderRadius: 16,
      backgroundColor: colors.navy,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    catalogAddButtonText: {
      color: "#fff",
      fontSize: 14,
      fontFamily: fontFamilies.bodyExtraBold,
    },
    catalogEmptyState: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 16,
      paddingVertical: 18,
    },
    catalogEmptyTitle: {
      color: colors.text,
      fontSize: 16,
      fontFamily: fontFamilies.displaySemiBold,
      marginBottom: 6,
    },
    catalogEmptyText: {
      color: colors.mutedText,
      fontSize: 14,
      lineHeight: 21,
      fontFamily: fontFamilies.bodyMedium,
    },
    levelEditorStack: {
      gap: 12,
    },
    levelEditorCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 12,
    },
    levelEditorHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    levelEditorLanguageWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flexShrink: 1,
    },
    levelEditorFlag: {
      fontSize: 24,
    },
    levelEditorLanguage: {
      color: colors.text,
      fontSize: 18,
      fontFamily: fontFamilies.displayBold,
      textTransform: "capitalize",
    },
    levelEditorHint: {
      color: colors.mutedText,
      fontSize: 12,
      fontFamily: fontFamilies.bodySemiBold,
      textAlign: "right",
      flexShrink: 1,
    },
    levelOptionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    levelOptionChip: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    levelOptionChipActive: {
      backgroundColor: colors.navy,
      borderColor: colors.navy,
    },
    levelOptionChipText: {
      color: colors.text,
      fontSize: 12,
      fontFamily: fontFamilies.bodyBold,
    },
    levelOptionChipTextActive: {
      color: "#fff",
    },
    chip: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
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
    photosRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 6,
    },
    complementaryRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 2,
    },
    photoWrap: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: 18,
      overflow: "hidden",
    },
    profilePhotoWrap: {
      borderWidth: 1,
      borderColor: colors.border,
    },
    photo: {
      width: "100%",
      height: "100%",
      borderRadius: 18,
      backgroundColor: colors.surfaceMuted,
    },
    photoPlaceholder: {
      width: "100%",
      height: "100%",
      borderRadius: 18,
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
    photoBadge: {
      position: "absolute",
      left: 10,
      bottom: 10,
      borderRadius: 999,
      backgroundColor: "rgba(8, 19, 32, 0.78)",
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    photoBadgeText: {
      color: "#fff",
      fontSize: 11,
      fontFamily: fontFamilies.bodyBold,
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
    footerSpacer: {
      height: 20,
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
    avatarAccentCard: {
      gap: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      padding: 14,
    },
    avatarAccentPreviewRow: {
      flexDirection: "row",
      gap: 14,
      alignItems: "center",
    },
    avatarAccentPreview: {
      width: 82,
      height: 82,
      borderRadius: 41,
      borderWidth: 3,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    avatarAccentPreviewImage: {
      width: 74,
      height: 74,
      borderRadius: 37,
    },
    avatarAccentTextWrap: {
      flex: 1,
      gap: 4,
    },
    avatarAccentTitle: {
      color: colors.text,
      fontSize: 17,
      fontFamily: fontFamilies.displayBold,
    },
    avatarAccentDescription: {
      color: colors.mutedText,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fontFamilies.bodyMedium,
    },
    avatarAccentCode: {
      color: colors.link,
      fontSize: 13,
      fontFamily: fontFamilies.bodyBold,
      textTransform: "lowercase",
    },
    avatarAccentPickerCard: {
      gap: 10,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
    },
    avatarAccentSectionLabel: {
      color: colors.text,
      fontSize: 13,
      fontFamily: fontFamilies.bodyBold,
    },
    avatarAccentHexInput: {
      minHeight: 50,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 14,
      color: colors.text,
      fontSize: 15,
      fontFamily: fontFamilies.bodySemiBold,
      textTransform: "lowercase",
    },
    avatarAccentHexInputInvalid: {
      borderColor: colors.danger,
    },
    avatarAccentError: {
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: fontFamilies.bodyMedium,
    },
    avatarAccentSwatches: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    avatarAccentSwatchButton: {
      width: "31%",
      minWidth: 88,
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    avatarAccentSwatchButtonActive: {
      borderColor: colors.navy,
      backgroundColor: colors.surface,
    },
    avatarAccentSwatch: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.5)",
    },
    avatarAccentSwatchLabel: {
      color: colors.text,
      fontSize: 12,
      fontFamily: fontFamilies.bodySemiBold,
      textAlign: "center",
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
    languageChipContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    languageChipFlagWrap: {
      width: 18,
      height: 18,
      borderRadius: 9,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    languageChipEmoji: {
      fontSize: 14,
      lineHeight: 16,
    },
    languageChipEmojiActive: {
      color: "#fff",
    },
    languageChipText: {
      color: colors.text,
      fontSize: 13,
      fontFamily: fontFamilies.bodySemiBold,
      textTransform: "capitalize",
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
