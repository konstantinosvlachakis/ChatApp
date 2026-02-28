import React, { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { updateSettings } from "../services/api/auth";
import type { ThemeColors } from "../theme/colors";

export function SettingsScreen() {
  const { user, refreshProfile, logout } = useAuth();
  const { colors, mode, setMode } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [baseLanguage, setBaseLanguage] = useState("");
  const [practicing, setPracticing] = useState("");
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setBaseLanguage(user?.base_translate_language || "english");
    setPracticing((user?.languages_practicing || []).join(", "));
  }, [user]);

  const onSave = async () => {
    try {
      setSaving(true);
      await updateSettings({
        base_translate_language: baseLanguage.trim().toLowerCase(),
        languages_practicing: practicing
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      });
      await refreshProfile();
      Alert.alert("Saved", "Settings updated.");
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.group}>
          <Text style={styles.label}>Base translate language</Text>
          <TextInput
            style={styles.input}
            value={baseLanguage}
            onChangeText={setBaseLanguage}
            autoCapitalize="none"
            placeholder="english"
          />
        </View>
        <View style={styles.group}>
          <Text style={styles.label}>Languages practicing (comma separated)</Text>
          <TextInput
            style={styles.input}
            value={practicing}
            onChangeText={setPracticing}
            placeholder="Russian, Spanish"
          />
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
        <Pressable style={styles.button} onPress={onSave} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? "Saving..." : "Save settings"}</Text>
        </Pressable>
        <Pressable style={styles.logoutButton} onPress={onLogout} disabled={loggingOut}>
          <Text style={styles.logoutButtonText}>
            {loggingOut ? "Logging out..." : "Log out"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 14 },
    title: { fontSize: 28, fontWeight: "800", color: colors.text },
    group: { gap: 6 },
    label: { color: colors.text, fontSize: 14, fontWeight: "600" },
    input: {
      backgroundColor: colors.inputBackground,
      color: colors.text,
      borderRadius: 12,
      borderColor: colors.border,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    switchCard: {
      marginTop: 4,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    switchTextWrap: {
      flex: 1,
      gap: 2,
    },
    switchTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
    },
    switchSubtitle: {
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 18,
    },
    button: {
      marginTop: 4,
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
    },
    buttonText: { color: "#fff", fontWeight: "700" },
    logoutButton: {
      alignItems: "center",
      backgroundColor: colors.danger,
      borderRadius: 12,
      paddingVertical: 12,
    },
    logoutButtonText: {
      color: "#fff",
      fontWeight: "700",
    },
  });
