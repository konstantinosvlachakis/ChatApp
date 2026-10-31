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
import { Image } from "expo-image";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../services/api/errors";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";

const LOGO = require("../../assets/icon.png");
const LOGO_SIZE = 64;

export function LoginScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    try {
      setLoading(true);
      await login(email.trim(), password);
    } catch (err) {
      Alert.alert("Login failed", getErrorMessage(err, "Check your credentials and API base URL."));
    } finally {
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
          {/* Same tile as the launch splash, so splash -> login reads as one brand moment. */}
          <Image
            source={LOGO}
            style={styles.logo}
            contentFit="cover"
            accessibilityRole="image"
            accessibilityLabel="LangVoyage"
          />
          <View style={styles.card}>
            <Text style={styles.brand}>LangVoyage</Text>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>
              Log in to continue your conversations and language practice.
            </Text>

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
            <Pressable style={styles.button} onPress={onSubmit} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Log in</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("ForgotPassword", { email: email.trim() })}
              accessibilityRole="link"
              hitSlop={8}
            >
              <Text style={styles.link}>Forgot password?</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate("Register")}>
              <Text style={styles.link}>Don&apos;t have an account? Sign up</Text>
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
    logo: {
      width: LOGO_SIZE,
      height: LOGO_SIZE,
      // Same 24% corner ratio as the splash tile.
      borderRadius: LOGO_SIZE * 0.24,
      alignSelf: "center",
      marginBottom: 18,
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
      marginBottom: 4,
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
