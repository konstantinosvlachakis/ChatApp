import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
// keyboard-controller KAV: the KeyboardProvider (App.tsx) stops Android from resizing the window.
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { requestPasswordReset } from "../services/api/auth";
import { getErrorMessage } from "../services/api/errors";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Requests a password reset email. The backend answers the same way whether or not
 * the address has an account, so this always ends on "check your inbox". The new
 * password is chosen on the web page the emailed link opens.
 */
export function ForgotPasswordScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [email, setEmail] = useState<string>(route.params?.email ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const inFlightRef = useRef(false);

  const onSubmit = async () => {
    if (inFlightRef.current) return;
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    inFlightRef.current = true;
    setLoading(true);
    try {
      await requestPasswordReset(trimmed);
      setSentTo(trimmed);
    } catch (err) {
      setError(getErrorMessage(err, "We couldn't send the reset email. Please try again."));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
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
            {sentTo ? (
              <View accessibilityLiveRegion="polite">
                <Text style={styles.title} accessibilityRole="header">
                  Check your inbox
                </Text>
                <Text style={styles.subtitle}>
                  If an account exists for {sentTo}, we&apos;ve sent a link to reset your password.
                  It expires in 1 hour. Open it on this phone or any browser, choose a new password,
                  then log in here.
                </Text>
                <Text style={styles.hint}>
                  Didn&apos;t get it? Check your spam folder, or try again in a few minutes.
                </Text>
                <Pressable style={styles.button} onPress={() => navigation.navigate("Login")}>
                  <Text style={styles.buttonText}>Back to log in</Text>
                </Pressable>
                <Pressable onPress={() => setSentTo("")} accessibilityRole="button">
                  <Text style={styles.link}>Use a different email</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.title} accessibilityRole="header">
                  Forgot password?
                </Text>
                <Text style={styles.subtitle}>
                  Enter the email you signed up with and we&apos;ll send you a link to choose a new
                  password.
                </Text>
                <TextInput
                  style={styles.input}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  placeholder="Email"
                  value={email}
                  onChangeText={setEmail}
                  onSubmitEditing={onSubmit}
                  returnKeyType="send"
                  placeholderTextColor={colors.mutedText}
                  accessibilityLabel="Email"
                />
                {error ? (
                  <Text style={styles.error} accessibilityLiveRegion="polite">
                    {error}
                  </Text>
                ) : null}
                <Pressable
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={onSubmit}
                  disabled={loading}
                  accessibilityRole="button"
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Send reset link</Text>
                  )}
                </Pressable>
                <Pressable onPress={() => navigation.goBack()} accessibilityRole="link">
                  <Text style={styles.link}>Back to log in</Text>
                </Pressable>
              </>
            )}
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
      fontSize: 28,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 14,
      color: colors.mutedText,
      marginBottom: 14,
      lineHeight: 20,
    },
    hint: {
      fontSize: 13,
      color: colors.mutedText,
      marginBottom: 14,
      lineHeight: 18,
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
    error: {
      color: colors.danger,
      fontSize: 13,
      marginBottom: 10,
    },
    button: {
      marginTop: 4,
      backgroundColor: colors.navy,
      borderRadius: 14,
      alignItems: "center",
      paddingVertical: 12,
    },
    buttonDisabled: {
      opacity: 0.6,
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
