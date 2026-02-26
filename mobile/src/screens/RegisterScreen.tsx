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

export function RegisterScreen() {
  const navigation = useNavigation<any>();
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
              placeholderTextColor="#94a3b8"
            />
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              placeholderTextColor="#94a3b8"
            />
            <TextInput
              style={styles.input}
              secureTextEntry
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              placeholderTextColor="#94a3b8"
            />
            <TextInput
              style={styles.input}
              placeholder="Native language (e.g. English)"
              value={nativeLanguage}
              onChangeText={setNativeLanguage}
              placeholderTextColor="#94a3b8"
            />
            <TextInput
              style={styles.input}
              placeholder="Date of birth YYYY-MM-DD (optional)"
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholderTextColor="#94a3b8"
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  bgBlobOne: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(6,182,212,0.16)",
    top: -80,
    left: -60,
  },
  bgBlobTwo: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(56,189,248,0.14)",
    bottom: -100,
    right: -60,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
    padding: 20,
    shadowColor: "#0f172a",
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
    color: "#0e7490",
    marginBottom: 6,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#475569",
    marginBottom: 14,
    lineHeight: 20,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    color: "#0f172a",
    fontSize: 15,
  },
  button: {
    marginTop: 4,
    backgroundColor: "#0f172a",
    borderRadius: 14,
    alignItems: "center",
    paddingVertical: 12,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
  },
  link: {
    color: "#0e7490",
    textAlign: "center",
    marginTop: 12,
    fontWeight: "600",
  },
});
