import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ThemeColors } from "../theme/colors";
import { fontFamilies } from "../theme/typography";

const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "inappropriate_content", label: "Inappropriate content" },
  { value: "impersonation", label: "Impersonation" },
  { value: "scam", label: "Scam or fraud" },
  { value: "other", label: "Other" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

type ReportUserModalProps = {
  colors: ThemeColors;
  visible: boolean;
  username?: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: { reason: ReportReason; details: string }) => void;
};

export function ReportUserModal({
  colors,
  visible,
  username,
  loading = false,
  onClose,
  onSubmit,
}: ReportUserModalProps) {
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [reason, setReason] = React.useState<ReportReason>("spam");
  const [details, setDetails] = React.useState("");

  React.useEffect(() => {
    if (!visible) {
      setReason("spam");
      setDetails("");
    }
  }, [visible]);

  const needsDetails = reason === "other";
  const canSubmit = !loading && (!needsDetails || details.trim().length > 0);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.title}>Report {username || "user"}</Text>
          <Text style={styles.subtitle}>
            Tell us what happened. Reports are reviewed by the team.
          </Text>

          <ScrollView style={styles.reasonList} showsVerticalScrollIndicator={false}>
            {REPORT_REASONS.map((option) => {
              const active = reason === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.reasonRow, active ? styles.reasonRowActive : undefined]}
                  onPress={() => setReason(option.value)}
                >
                  <Text style={[styles.reasonText, active ? styles.reasonTextActive : undefined]}>
                    {option.label}
                  </Text>
                  {active ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.danger} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.detailsWrap}>
            <Text style={styles.detailsLabel}>
              {needsDetails ? "Tell us more" : "Extra details (optional)"}
            </Text>
            <TextInput
              style={[styles.detailsInput, needsDetails ? styles.detailsInputRequired : undefined]}
              value={details}
              onChangeText={setDetails}
              placeholder={needsDetails ? "Please describe the issue" : "Add context if helpful"}
              placeholderTextColor={colors.mutedText}
              multiline
              textAlignVertical="top"
            />
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.reportButton, !canSubmit ? styles.reportButtonDisabled : undefined]}
              disabled={!canSubmit}
              onPress={() => onSubmit({ reason, details: details.trim() })}
            >
              <Text style={styles.reportButtonText}>{loading ? "Reporting..." : "Report user"}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(8,19,32,0.42)",
      justifyContent: "center",
      padding: 18,
    },
    card: {
      borderRadius: 24,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      maxHeight: "80%",
    },
    title: {
      color: colors.text,
      fontSize: 20,
      fontFamily: fontFamilies.displaySemiBold,
    },
    subtitle: {
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 6,
      fontFamily: fontFamilies.bodyMedium,
    },
    reasonList: {
      marginTop: 16,
      maxHeight: 250,
    },
    reasonRow: {
      minHeight: 48,
      borderRadius: 16,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surfaceMuted,
      marginBottom: 8,
    },
    reasonRowActive: {
      backgroundColor: "#fff1f2",
      borderWidth: 1,
      borderColor: "rgba(217,91,112,0.22)",
    },
    reasonText: {
      color: colors.text,
      fontSize: 15,
      fontFamily: fontFamilies.bodySemiBold,
    },
    reasonTextActive: {
      color: colors.danger,
    },
    detailsWrap: {
      marginTop: 8,
      gap: 8,
    },
    detailsLabel: {
      color: colors.text,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
    },
    detailsInput: {
      minHeight: 110,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      fontFamily: fontFamilies.bodyMedium,
    },
    detailsInputRequired: {
      borderColor: colors.danger,
    },
    actions: {
      marginTop: 16,
      flexDirection: "row",
      gap: 10,
    },
    cancelButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceMuted,
    },
    cancelButtonText: {
      color: colors.text,
      fontSize: 15,
      fontFamily: fontFamilies.bodyBold,
    },
    reportButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.danger,
    },
    reportButtonDisabled: {
      opacity: 0.45,
    },
    reportButtonText: {
      color: "#fff",
      fontSize: 15,
      fontFamily: fontFamilies.displaySemiBold,
    },
  });
