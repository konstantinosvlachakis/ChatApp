import React from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export function ConversationsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <Text style={styles.title}>Conversations</Text>
        <Text style={styles.body}>Wire this to your existing conversation endpoints + websocket.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  body: { marginTop: 8, color: colors.mutedText, textAlign: "center" },
});
