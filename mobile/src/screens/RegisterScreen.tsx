import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
// keyboard-controller KAV: the KeyboardProvider (App.tsx) stops Android from resizing the window.
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { RESEND_COOLDOWN_SECONDS } from "../features/emailVerification";
import { register, type RegistrationPracticeLevel } from "../services/api/auth";
import { setResendAvailableIn } from "../services/emailVerification";
import { getErrorMessage } from "../services/api/errors";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { ProfileLanguageSelector } from "../components/ProfileLanguageSelector";
import { PROFILE_LANGUAGES } from "../features/profileLanguages";

const PRACTICE_LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "fluent", label: "Fluent" },
] as const;

export function RegisterScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nativeLanguage, setNativeLanguage] = useState("english");
  // Every account starts with at least one learning language, each with its own level.
  const [practiceLanguages, setPracticeLanguages] = useState<string[]>([]);
  const [practiceLanguageLevels, setPracticeLanguageLevels] = useState<Record<string, RegistrationPracticeLevel>>({});
  const [openPicker, setOpenPicker] = useState<"native" | "practice" | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!username.trim() || !email.trim() || !password || !nativeLanguage.trim()) {
      Alert.alert("Missing fields", "Please fill all required fields.");
      return;
    }
    if (practiceLanguages.length === 0) {
      Alert.alert("Choose a language", "Pick at least one language you want to learn.");
      setOpenPicker("practice");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    try {
      setLoading(true);
      await register({
        username: username.trim(),
        email: normalizedEmail,
        password,
        nativeLanguage: nativeLanguage.trim(),
        practiceLanguages,
        practiceLanguageLevels: Object.fromEntries(
          practiceLanguages.map((language) => [language, practiceLanguageLevels[language] || "beginner"])
        ),
        dateOfBirth: dateOfBirth.trim() || undefined,
      });
    } catch (err) {
      Alert.alert("Sign up failed", getErrorMessage(err, "Could not create account."));
      setLoading(false);
      return;
    }
    // The server already emailed the first code: start the resend cooldown, don't send another.
    setResendAvailableIn(RESEND_COOLDOWN_SECONDS);
    try {
      // Signs in with the same credentials; the logged-in stack replaces this one and AppTabs
      // opens VerifyEmail (AuthContext.pendingEmailVerification).
      await login(normalizedEmail, password, { verifyEmail: true });
    } catch {
      setLoading(false);
      Alert.alert(
        "Account created",
        "Log in to continue. We emailed you a 6-digit code to verify your address."
      );
      navigation.navigate("Login");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.bgBlobOne} />
      <View style={styles.bgBlobTwo} />
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.brand}>LangVoyage</Text>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>
              Join LangVoyage and start meeting language partners.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Username"
              value={username}
              onChangeText={setUsername}
              placeholderTextColor={colors.mutedText}
            />
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              placeholderTextColor={colors.mutedText}
            />
            <TextInput
              style={styles.input}
              secureTextEntry
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              placeholderTextColor={colors.mutedText}
            />
            <ProfileLanguageSelector
              label="I speak"
              colors={colors}
              options={PROFILE_LANGUAGES}
              selected={[nativeLanguage]}
              expanded={openPicker === "native"}
              onToggle={() => setOpenPicker((current) => (current === "native" ? null : "native"))}
              onSelect={(value) => {
                setNativeLanguage(value);
                setPracticeLanguages((current) => current.filter((language) => language !== value));
                setPracticeLanguageLevels((current) => {
                  const next = { ...current };
                  delete next[value];
                  return next;
                });
                setOpenPicker(null);
              }}
            />
            <ProfileLanguageSelector
              label="I want to learn"
              colors={colors}
              options={PROFILE_LANGUAGES.filter((option) => option.value !== nativeLanguage)}
              selected={practiceLanguages}
              multiple
              expanded={openPicker === "practice"}
              onToggle={() => setOpenPicker((current) => (current === "practice" ? null : "practice"))}
              onSelect={(value) => {
                const removing = practiceLanguages.includes(value);
                setPracticeLanguages((current) => removing
                  ? current.filter((language) => language !== value)
                  : [...current, value]);
                setPracticeLanguageLevels((current) => {
                  const next = { ...current };
                  if (removing) delete next[value];
                  else next[value] = "beginner";
                  return next;
                });
              }}
            />
            {practiceLanguages.map((language) => {
              const languageLabel = PROFILE_LANGUAGES.find((option) => option.value === language)?.label || language;
              return (
                <View key={language} style={styles.languageLevel}>
                  <Text style={styles.fieldLabel}>My level in {languageLabel}</Text>
                  <View style={styles.levelRow} accessibilityRole="radiogroup" accessibilityLabel={`My level in ${languageLabel}`}>
                    {PRACTICE_LEVELS.map((level) => {
                      const selected = (practiceLanguageLevels[language] || "beginner") === level.value;
                      return (
                        <Pressable
                          key={level.value}
                          onPress={() => setPracticeLanguageLevels((current) => ({ ...current, [language]: level.value }))}
                          style={[styles.levelChip, selected && styles.levelChipSelected]}
                          accessibilityRole="radio"
                          accessibilityLabel={`${languageLabel}: ${level.label}`}
                          accessibilityState={{ selected }}
                        >
                          <Text style={[styles.levelChipText, selected && styles.levelChipTextSelected]}>{level.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
            <TextInput
              style={styles.input}
              placeholder="Date of birth YYYY-MM-DD (optional)"
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholderTextColor={colors.mutedText}
            />

            <Pressable style={styles.button} onPress={onSubmit} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sign up</Text>
              )}
            </Pressable>

            <Pressable onPress={() => navigation.navigate("Login")}>
              <Text style={styles.link}>Already have an account? Log in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    bgBlobOne: {
      position: "absolute",
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: isDark ? "rgba(56,189,248,0.08)" : "rgba(6,182,212,0.16)",
      top: -80,
      left: -60,
    },
    bgBlobTwo: {
      position: "absolute",
      width: 280,
      height: 280,
      borderRadius: 140,
      backgroundColor: colors.overlayTint,
      bottom: -100,
      right: -60,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 20,
      paddingTop: 28,
      paddingBottom: 28,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    brand: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.6,
      textTransform: "uppercase",
      color: colors.link,
      marginBottom: 6,
    },
    title: {
      fontSize: 32,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 14,
      color: colors.mutedText,
      marginBottom: 14,
      lineHeight: 20,
    },
    input: {
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 10,
      color: colors.text,
      fontSize: 15,
    },
    languageLevel: {
      marginTop: 10,
    },
    fieldLabel: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700",
      marginBottom: 8,
    },
    levelRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 14,
    },
    levelChip: {
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.inputBackground,
      justifyContent: "center",
    },
    levelChipSelected: {
      backgroundColor: colors.navy,
      borderColor: colors.navy,
    },
    levelChipText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "600",
    },
    levelChipTextSelected: {
      color: "#fff",
    },
    button: {
      marginTop: 4,
      backgroundColor: colors.navy,
      borderRadius: 14,
      alignItems: "center",
      paddingVertical: 12,
    },
    buttonText: {
      color: "#fff",
      fontWeight: "700",
    },
    link: {
      color: colors.link,
      textAlign: "center",
      marginTop: 12,
      fontWeight: "600",
    },
  });
