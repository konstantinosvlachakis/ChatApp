import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getCoachLanguageOptions } from "../features/coachConversation";
import { API_BASE_URL } from "../config/api";
import {
  deleteAccount,
  fetchModerationSummary,
  unblockUser,
  updateSettings,
} from "../services/api/auth";
import type { ThemeColors } from "../theme/colors";
import { fontFamilies } from "../theme/typography";
import type { ModerationSummary } from "../types";

type LanguageOption = {
  value: string;
  label: string;
};

const resolveMediaUrl = (path?: string | null) => {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  if (path.startsWith("/media/")) return `${API_BASE_URL}${path}`;
  return `${API_BASE_URL}/media/${path}`;
};

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { user, refreshProfile, logout } = useAuth();
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const languageOptions = useMemo<LanguageOption[]>(() => getCoachLanguageOptions(user), [user]);
  const [baseLanguage, setBaseLanguage] = useState("english");
  const [practiceLanguage, setPracticeLanguage] = useState("english");
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"base" | "practice" | null>(null);
  const [unblockingUsername, setUnblockingUsername] = useState<string | null>(null);
  const [moderation, setModeration] = useState<ModerationSummary>({
    blocked_profiles: [],
    reported_profiles: [],
  });

  useEffect(() => {
    const fallback = languageOptions[0]?.value || "english";
    setBaseLanguage((user?.base_translate_language || fallback).trim().toLowerCase());
    setPracticeLanguage(
      (user?.languages_practicing?.[0] || user?.native_language || fallback).trim().toLowerCase()
    );
  }, [languageOptions, user]);

  useEffect(() => {
    fetchModerationSummary()
      .then(setModeration)
      .catch(() => {});
  }, []);

  const selectedBaseLabel =
    languageOptions.find((option) => option.value === baseLanguage)?.label || baseLanguage;
  const selectedPracticeLabel =
    languageOptions.find((option) => option.value === practiceLanguage)?.label || practiceLanguage;

  const onSave = async () => {
    try {
      setSaving(true);
      await updateSettings({
        base_translate_language: baseLanguage,
        languages_practicing: practiceLanguage ? [practiceLanguage] : [],
      });
      await refreshProfile();
      Alert.alert("Saved", "Your preferences have been updated.");
    } catch {
      Alert.alert("Failed", "Could not update settings.");
    } finally {
      setSaving(false);
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

  const onContactSupport = async () => {
    const supportEmail = user?.support_email || "support@langvoyage.app";
    const mailtoUrl = `mailto:${supportEmail}?subject=${encodeURIComponent("LangVoyage support")}`;
    try {
      await Linking.openURL(mailtoUrl);
    } catch {
      Alert.alert("Unavailable", `Please contact ${supportEmail} from your email app.`);
    }
  };

  const onDeleteAccount = () => {
    Alert.alert(
      "Delete account",
      "This permanently removes your account, chats, and practice progress. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingAccount(true);
              await deleteAccount();
              await logout();
            } catch {
              Alert.alert("Failed", "Could not delete your account.");
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  const applyLanguage = (value: string) => {
    if (pickerTarget === "base") {
      setBaseLanguage(value);
    } else if (pickerTarget === "practice") {
      setPracticeLanguage(value);
    }
    setPickerTarget(null);
  };

  const formatHistoryDate = (value?: string) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const onUnblock = (username: string) => {
    Alert.alert("Unblock user", `Allow ${username} to contact you again?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unblock",
        onPress: async () => {
          try {
            setUnblockingUsername(username);
            await unblockUser(username);
            setModeration((prev) => ({
              ...prev,
              blocked_profiles: prev.blocked_profiles.filter((entry) => entry.username !== username),
            }));
            await refreshProfile().catch(() => {});
            Alert.alert("Unblocked", `${username} has been removed from your blocked list.`);
          } catch {
            Alert.alert("Failed", "Could not unblock this user.");
          } finally {
            setUnblockingUsername(null);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={18} color={colors.text} />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Preferences</Text>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>
            Tune the app to the way you learn, translate, and practice every day.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="language-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionTitle}>Language Preferences</Text>
              <Text style={styles.sectionSubtitle}>
                Pick your translation base and your main practice language.
              </Text>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Base translate language</Text>
            <Pressable style={styles.selectField} onPress={() => setPickerTarget("base")}>
              <Text style={styles.selectValue}>{selectedBaseLabel}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.mutedText} />
            </Pressable>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Language you’re practicing</Text>
            <Pressable style={styles.selectField} onPress={() => setPickerTarget("practice")}>
              <Text style={styles.selectValue}>{selectedPracticeLabel}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.mutedText} />
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="contrast-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionTitle}>Appearance</Text>
              <Text style={styles.sectionSubtitle}>
                Keep things bright or switch to a softer night-friendly look.
              </Text>
            </View>
          </View>

          <View style={styles.switchCard}>
            <View style={styles.switchTextWrap}>
              <Text style={styles.switchTitle}>Dark mode</Text>
              <Text style={styles.switchSubtitle}>
                Use a darker interface that is easier on your eyes at night.
              </Text>
            </View>
            <Switch
              value={mode === "dark"}
              onValueChange={(nextValue) => {
                setMode(nextValue ? "dark" : "light").catch(() => {});
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={mode === "dark" ? colors.navy : colors.surface}
              ios_backgroundColor={colors.border}
            />
          </View>
        </View>

        <Pressable style={styles.primaryButton} onPress={onSave} disabled={saving}>
          <Text style={styles.primaryButtonText}>{saving ? "Saving..." : "Save changes"}</Text>
        </Pressable>

        <View style={styles.accountCard}>
          <Text style={styles.accountTitle}>Support & account</Text>
          <Text style={styles.accountText}>
            Need help, want to sign out, or manage your account permanently?
          </Text>

          <Pressable style={styles.secondaryButton} onPress={onContactSupport}>
            <Ionicons name="mail-outline" size={18} color={colors.text} />
            <Text style={styles.secondaryButtonText}>Contact support</Text>
          </Pressable>

          <Pressable style={styles.logoutButton} onPress={onLogout} disabled={loggingOut}>
            <Text style={styles.logoutButtonText}>
              {loggingOut ? "Logging out..." : "Log out"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.deleteButton}
            onPress={onDeleteAccount}
            disabled={deletingAccount}
          >
            <Text style={styles.deleteButtonText}>
              {deletingAccount ? "Deleting account..." : "Delete account"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionTitle}>Safety history</Text>
              <Text style={styles.sectionSubtitle}>
                Review who you have blocked and which profiles you have reported.
              </Text>
            </View>
          </View>

          <View style={styles.historyBlock}>
            <Text style={styles.historyTitle}>Blocked profiles</Text>
            {moderation.blocked_profiles.length ? (
              moderation.blocked_profiles.map((entry) => (
                <View key={`blocked-${entry.username}-${entry.created_at}`} style={styles.historyRowStack}>
                  <View style={styles.historyRow}>
                    {resolveMediaUrl(entry.profile_image_url) ? (
                      <Image
                        source={{ uri: resolveMediaUrl(entry.profile_image_url) || undefined }}
                        style={styles.historyAvatar}
                      />
                    ) : (
                      <View style={styles.historyAvatarPlaceholder}>
                        <Ionicons name="person" size={16} color={colors.mutedText} />
                      </View>
                    )}
                    <View style={styles.historyCopy}>
                      <Text style={styles.historyName}>{entry.username}</Text>
                      <Text style={styles.historyMeta}>
                        Blocked {formatHistoryDate(entry.created_at)}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.historyActionButton}
                      onPress={() => onUnblock(entry.username)}
                      disabled={unblockingUsername === entry.username}
                    >
                      <Text style={styles.historyActionButtonText}>
                        {unblockingUsername === entry.username ? "..." : "Unblock"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.historyEmpty}>You have not blocked anyone yet.</Text>
            )}
          </View>

          <View style={styles.historyBlock}>
            <Text style={styles.historyTitle}>Reported profiles</Text>
            {moderation.reported_profiles.length ? (
              moderation.reported_profiles.map((entry, index) => (
                <View
                  key={`reported-${entry.username}-${entry.created_at}-${index}`}
                  style={styles.historyRowStack}
                >
                  <View style={styles.historyRow}>
                    {resolveMediaUrl(entry.profile_image_url) ? (
                      <Image
                        source={{ uri: resolveMediaUrl(entry.profile_image_url) || undefined }}
                        style={styles.historyAvatar}
                      />
                    ) : (
                      <View style={styles.historyAvatarPlaceholder}>
                        <Ionicons name="person" size={16} color={colors.mutedText} />
                      </View>
                    )}
                    <View style={styles.historyCopy}>
                      <Text style={styles.historyName}>{entry.username}</Text>
                      <Text style={styles.historyMeta}>
                        Reported {formatHistoryDate(entry.created_at)}
                      </Text>
                    </View>
                    <Text style={styles.reportedMeta}>{entry.reason.replace(/_/g, " ")}</Text>
                  </View>
                  {entry.details ? (
                    <Text style={styles.historyDetails}>{entry.details}</Text>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.historyEmpty}>You have not reported any profiles yet.</Text>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={pickerTarget !== null}
        animationType="fade"
        onRequestClose={() => setPickerTarget(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerTarget(null)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {pickerTarget === "base" ? "Choose base language" : "Choose practice language"}
            </Text>
            <Text style={styles.modalSubtitle}>
              {pickerTarget === "base"
                ? "Incoming translations will target this language."
                : "Practice tools will prefer this language first."}
            </Text>

            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {languageOptions.map((option) => {
                const active =
                  (pickerTarget === "base" ? baseLanguage : practiceLanguage) === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.optionRow, active ? styles.optionRowActive : undefined]}
                    onPress={() => applyLanguage(option.value)}
                  >
                    <Text style={[styles.optionText, active ? styles.optionTextActive : undefined]}>
                      {option.label}
                    </Text>
                    {active ? (
                      <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      padding: 16,
      paddingBottom: 36,
      gap: 16,
    },
    topBar: {
      marginBottom: 2,
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
      padding: 22,
      borderRadius: 28,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    eyebrow: {
      color: colors.link,
      fontSize: 12,
      fontFamily: fontFamilies.displayBold,
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },
    title: {
      marginTop: 10,
      fontSize: 34,
      color: colors.text,
      fontFamily: fontFamilies.displayBold,
    },
    subtitle: {
      marginTop: 10,
      color: colors.mutedText,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: fontFamilies.bodyMedium,
    },
    sectionCard: {
      borderRadius: 24,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      gap: 16,
    },
    sectionHeader: {
      flexDirection: "row",
      gap: 12,
      alignItems: "flex-start",
    },
    sectionIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionHeaderCopy: { flex: 1 },
    sectionTitle: {
      color: colors.text,
      fontSize: 18,
      fontFamily: fontFamilies.displaySemiBold,
    },
    sectionSubtitle: {
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
      fontFamily: fontFamilies.bodyMedium,
    },
    fieldGroup: { gap: 8 },
    label: {
      color: colors.text,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
    },
    selectField: {
      minHeight: 54,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    selectValue: {
      color: colors.text,
      fontSize: 16,
      fontFamily: fontFamilies.bodySemiBold,
      textTransform: "capitalize",
    },
    switchCard: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    switchTextWrap: { flex: 1, gap: 4 },
    switchTitle: {
      color: colors.text,
      fontSize: 16,
      fontFamily: fontFamilies.displaySemiBold,
    },
    switchSubtitle: {
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: fontFamilies.bodyMedium,
    },
    primaryButton: {
      borderRadius: 18,
      paddingVertical: 15,
      alignItems: "center",
      backgroundColor: colors.navy,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    primaryButtonText: {
      color: "#ffffff",
      fontSize: 16,
      fontFamily: fontFamilies.displaySemiBold,
    },
    accountCard: {
      borderRadius: 24,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      gap: 12,
    },
    accountTitle: {
      color: colors.text,
      fontSize: 18,
      fontFamily: fontFamilies.displaySemiBold,
    },
    accountText: {
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: fontFamilies.bodyMedium,
    },
    historyBlock: {
      gap: 8,
    },
    historyTitle: {
      color: colors.text,
      fontSize: 15,
      fontFamily: fontFamilies.displaySemiBold,
    },
    historyRow: {
      minHeight: 44,
      borderRadius: 14,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    historyRowStack: {
      borderRadius: 16,
      backgroundColor: colors.surfaceMuted,
      padding: 14,
      gap: 6,
    },
    historyName: {
      color: colors.text,
      fontSize: 15,
      fontFamily: fontFamilies.bodyBold,
    },
    historyAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    historyAvatarPlaceholder: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    historyCopy: {
      flex: 1,
      gap: 4,
      paddingRight: 12,
    },
    historyMeta: {
      color: colors.mutedText,
      fontSize: 12,
      textTransform: "uppercase",
      fontFamily: fontFamilies.bodyBold,
    },
    reportedMeta: {
      color: colors.danger,
      fontSize: 12,
      textTransform: "uppercase",
      fontFamily: fontFamilies.bodyBold,
    },
    historyDetails: {
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fontFamilies.bodyMedium,
    },
    historyEmpty: {
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: fontFamilies.bodyMedium,
    },
    historyActionButton: {
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    historyActionButtonText: {
      color: colors.text,
      fontSize: 12,
      fontFamily: fontFamilies.bodyBold,
    },
    secondaryButton: {
      marginTop: 4,
      borderRadius: 16,
      backgroundColor: colors.surfaceMuted,
      paddingVertical: 14,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 15,
      fontFamily: fontFamilies.bodyBold,
    },
    logoutButton: {
      borderRadius: 16,
      backgroundColor: colors.danger,
      paddingVertical: 14,
      alignItems: "center",
    },
    logoutButtonText: {
      color: "#ffffff",
      fontSize: 15,
      fontFamily: fontFamilies.displaySemiBold,
    },
    deleteButton: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.danger,
      backgroundColor: colors.surface,
      paddingVertical: 14,
      alignItems: "center",
    },
    deleteButtonText: {
      color: colors.danger,
      fontSize: 15,
      fontFamily: fontFamilies.bodyBold,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(8, 19, 32, 0.38)",
      justifyContent: "flex-end",
      padding: 12,
    },
    modalCard: {
      maxHeight: "72%",
      borderRadius: 26,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 20,
      fontFamily: fontFamilies.displaySemiBold,
    },
    modalSubtitle: {
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 6,
      fontFamily: fontFamilies.bodyMedium,
    },
    modalList: {
      marginTop: 16,
    },
    optionRow: {
      minHeight: 50,
      borderRadius: 16,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      marginBottom: 8,
    },
    optionRowActive: {
      backgroundColor: colors.surfaceMuted,
    },
    optionText: {
      color: colors.text,
      fontSize: 15,
      fontFamily: fontFamilies.bodySemiBold,
      textTransform: "capitalize",
    },
    optionTextActive: {
      color: colors.primary,
    },
  });
