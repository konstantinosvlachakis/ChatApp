import React, { useEffect, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { updateSettings } from "../services/api/auth";
import { colors } from "../theme/colors";

export function SettingsScreen() {
  const { user, refreshProfile } = useAuth();
  const [baseLanguage, setBaseLanguage] = useState("");
  const [practicing, setPracticing] = useState("");
  const [saving, setSaving] = useState(false);

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
        <Pressable style={styles.button} onPress={onSave} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? "Saving..." : "Save settings"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 14 },
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  group: { gap: 6 },
  label: { color: colors.text, fontSize: 14, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    marginTop: 4,
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  buttonText: { color: "white", fontWeight: "700" },
});
