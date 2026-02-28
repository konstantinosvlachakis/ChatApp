import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { register } from "../services/api/auth";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";

export function RegisterScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nativeLanguage, setNativeLanguage] = useState("English");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!username.trim() || !email.trim() || !password || !nativeLanguage.trim()) {
      Alert.alert("Missing fields", "Please fill all required fields.");
      return;
    }

    try {
      setLoading(true);
      await register({
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
        nativeLanguage: nativeLanguage.trim(),
        dateOfBirth: dateOfBirth.trim() || undefined,
      });
      Alert.alert("Success", "Account created. You can log in now.");
      navigation.navigate("Login");
    } catch (err: any) {
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        "Could not create account.";
      Alert.alert("Sign up failed", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.bgBlobOne} />
      <View style={styles.bgBlobTwo} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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
            <TextInput
              style={styles.input}
              placeholder="Native language (e.g. English)"
              value={nativeLanguage}
              onChangeText={setNativeLanguage}
              placeholderTextColor={colors.mutedText}
            />
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
      padding: 20,
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
