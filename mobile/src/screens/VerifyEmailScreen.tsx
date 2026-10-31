import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
// keyboard-controller KAV: the KeyboardProvider (App.tsx) stops Android from resizing the window.
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CodeInput, type CodeInputHandle } from "../components/CodeInput";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  attemptsRemaining,
  cooldownSeconds,
  formatCooldown,
  isCompleteVerificationCode,
  needsNewCode,
} from "../features/emailVerification";
import { confirmEmailVerification, sendEmailVerificationCode } from "../services/api/auth";
import { toApiError } from "../services/api/errors";
import { getResendCooldownRemaining, setResendAvailableIn } from "../services/emailVerification";
import { showToast } from "../services/toast";
import { warmColors, type WarmColors } from "../theme/warm";

/**
 * Enter the 6-digit code emailed to the account address. Opened after sign-up (route param
 * `codeSent`: the server already mailed a code, so none is sent here), from the "Verify your
 * email" banner / gated-action prompt, and after an email change in Profile.
 */
export function VerifyEmailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const codeSent = Boolean(route.params?.codeSent);
  const { user, refreshProfile, setEmailVerified } = useAuth();
  const { isDark } = useTheme();
  const warm = warmColors(isDark);
  const styles = useMemo(() => createStyles(warm, isDark), [warm, isDark]);
  const email = user?.email || "your email";

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [suggestNewCode, setSuggestNewCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentNotice, setSentNotice] = useState("");
  const [cooldown, setCooldown] = useState(() => getResendCooldownRemaining());
  const verifyInFlightRef = useRef(false);
  const sendInFlightRef = useRef(false);
  const codeInputRef = useRef<CodeInputHandle>(null);

  // Tick the resend cooldown (module state, so it survives leaving and re-opening the screen).
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      const remaining = getResendCooldownRemaining();
      setCooldown(remaining);
      if (remaining <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCooldown = (seconds: number) => {
    setResendAvailableIn(seconds);
    setCooldown(getResendCooldownRemaining());
  };

  const goToTabs = useCallback(() => {
    navigation.navigate("AppTabs");
  }, [navigation]);

  const finishVerified = useCallback(
    (message: string) => {
      setEmailVerified(true);
      refreshProfile().catch(() => {});
      showToast(message, { variant: "success", title: "Email verified" });
      goToTabs();
    },
    [goToTabs, refreshProfile, setEmailVerified]
  );

  useEffect(() => {
    if (user?.email_verified) goToTabs();
  }, [goToTabs, user?.email_verified]);

  const verify = async (value: string = code) => {
    if (verifyInFlightRef.current) return;
    if (!isCompleteVerificationCode(value)) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    verifyInFlightRef.current = true;
    setVerifying(true);
    setError("");
    setHint("");
    setSuggestNewCode(false);
    try {
      await confirmEmailVerification(value);
      finishVerified("You're all set. Say hello to someone new!");
    } catch (failure) {
      const apiError = toApiError(failure);
      if (apiError.isAborted) return;
      setError(apiError.message || "That code didn't work. Please try again.");
      const remaining = attemptsRemaining(apiError.data);
      if (apiError.code === "invalid_code" && remaining !== null) {
        setHint(remaining === 1 ? "1 attempt left for this code." : `${remaining} attempts left for this code.`);
      }
      if (needsNewCode(apiError.code) || remaining === 0) setSuggestNewCode(true);
      setCode("");
      if (!needsNewCode(apiError.code)) codeInputRef.current?.focus();
    } finally {
      verifyInFlightRef.current = false;
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (sendInFlightRef.current || getResendCooldownRemaining() > 0) return;
    sendInFlightRef.current = true;
    setSending(true);
    setError("");
    setHint("");
    setSentNotice("");
    try {
      const response = await sendEmailVerificationCode();
      if (response.email_verified) {
        finishVerified("Your email is already verified.");
        return;
      }
      startCooldown(cooldownSeconds());
      setSuggestNewCode(false);
      setCode("");
      setSentNotice(`New code sent to ${response.email || email}. It expires in 15 minutes.`);
      codeInputRef.current?.focus();
    } catch (failure) {
      const apiError = toApiError(failure);
      if (apiError.isAborted) return;
      if (apiError.code === "throttled") startCooldown(cooldownSeconds(apiError.retryAfterSeconds));
      setError(apiError.message || "We couldn't send a new code. Please try again.");
    } finally {
      sendInFlightRef.current = false;
      setSending(false);
    }
  };

  const resendLabel = sending
    ? "Sending…"
    : cooldown > 0
      ? `Resend code in ${formatCooldown(cooldown)}`
      : suggestNewCode
        ? "Send a new code"
        : "Resend code";

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.bgBlobOne} />
      <View style={styles.bgBlobTwo} />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.brand}>LangVoyage</Text>
            <Text style={styles.title} accessibilityRole="header">
              Check your email
            </Text>
            <Text style={styles.subtitle}>
              {codeSent ? "We sent a 6-digit code to " : "Enter the 6-digit code we sent to "}
              <Text style={styles.email}>{email}</Text>
              {codeSent
                ? ". Enter it below to start chatting."
                : ", or ask for a new one below."}
            </Text>

            <CodeInput
              ref={codeInputRef}
              warm={warm}
              value={code}
              onChange={(next) => {
                setCode(next);
                if (error) setError("");
              }}
              onComplete={(full) => verify(full)}
              disabled={verifying}
              invalid={Boolean(error)}
              autoFocus
            />

            {error ? (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
            {hint ? <Text style={styles.hint}>{hint}</Text> : null}
            {sentNotice && !error ? (
              <Text style={styles.notice} accessibilityLiveRegion="polite">
                {sentNotice}
              </Text>
            ) : null}

            <Pressable
              style={[styles.button, (verifying || code.length === 0) && styles.buttonDisabled]}
              onPress={() => verify()}
              disabled={verifying}
              accessibilityRole="button"
              accessibilityState={{ disabled: verifying, busy: verifying }}
            >
              {verifying ? <ActivityIndicator color={warm.onNavy} /> : <Text style={styles.buttonText}>Verify</Text>}
            </Pressable>

            <Pressable
              onPress={resend}
              disabled={sending || cooldown > 0}
              accessibilityRole="button"
              accessibilityState={{ disabled: sending || cooldown > 0 }}
              style={styles.linkButton}
            >
              <Text style={[styles.link, (sending || cooldown > 0) && styles.linkDisabled]}>{resendLabel}</Text>
            </Pressable>

            <Text style={styles.footnote}>
              Didn&apos;t get it? Check your spam folder. Wrong address?{" "}
              <Text
                style={styles.inlineLink}
                onPress={() => navigation.navigate("AppTabs", { screen: "Profile" })}
                accessibilityRole="link"
              >
                Change it in your profile
              </Text>
            </Text>

            <Pressable onPress={goToTabs} accessibilityRole="button" style={styles.linkButton}>
              <Text style={styles.laterText}>Do this later</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (warm: WarmColors, isDark: boolean) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: {
      flex: 1,
      backgroundColor: warm.cream,
    },
    bgBlobOne: {
      position: "absolute",
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: warm.sage,
      opacity: isDark ? 0.35 : 0.7,
      top: -80,
      left: -60,
    },
    bgBlobTwo: {
      position: "absolute",
      width: 280,
      height: 280,
      borderRadius: 140,
      backgroundColor: warm.peachSoft,
      opacity: isDark ? 0.35 : 0.8,
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
      backgroundColor: warm.paper,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: warm.line,
      padding: 20,
      shadowColor: "#000",
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
      color: warm.teal,
      marginBottom: 6,
    },
    title: {
      fontSize: 28,
      fontWeight: "800",
      color: warm.ink,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 14,
      color: warm.inkSoft,
      marginBottom: 16,
      lineHeight: 20,
    },
    email: {
      fontWeight: "700",
      color: warm.ink,
    },
    error: {
      color: warm.danger,
      fontSize: 13,
      marginBottom: 6,
    },
    hint: {
      color: warm.inkSoft,
      fontSize: 13,
      marginBottom: 6,
    },
    notice: {
      color: warm.teal,
      fontSize: 13,
      marginBottom: 6,
    },
    button: {
      marginTop: 6,
      backgroundColor: warm.navy,
      borderRadius: 14,
      alignItems: "center",
      paddingVertical: 12,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: warm.onNavy,
      fontWeight: "700",
    },
    linkButton: {
      alignSelf: "center",
      paddingVertical: 6,
      marginTop: 8,
    },
    link: {
      color: warm.teal,
      textAlign: "center",
      fontWeight: "600",
    },
    linkDisabled: {
      color: warm.mutedInk,
    },
    footnote: {
      marginTop: 10,
      fontSize: 13,
      lineHeight: 18,
      color: warm.inkSoft,
      textAlign: "center",
    },
    inlineLink: {
      color: warm.teal,
      fontWeight: "600",
    },
    laterText: {
      color: warm.inkSoft,
      textAlign: "center",
      fontWeight: "600",
    },
  });
