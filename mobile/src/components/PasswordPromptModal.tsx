import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ThemeColors } from "../theme/colors";
import { fontFamilies } from "../theme/typography";

type PasswordPromptModalProps = {
  colors: ThemeColors;
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  destructive?: boolean;
  /** Server error to show under the field (e.g. "Your current password is incorrect."). */
  error?: string;
  onCancel: () => void;
  onSubmit: (password: string) => void;
};

/**
 * Asks for the current password before a sensitive change (account deletion). Works on
 * both platforms (Alert.prompt is iOS-only). The password is cleared whenever it closes.
 */
export function PasswordPromptModal({
  colors,
  visible,
  title,
  message,
  confirmLabel,
  busyLabel,
  busy = false,
  destructive = false,
  error,
  onCancel,
  onSubmit,
}: PasswordPromptModalProps) {
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [password, setPassword] = React.useState("");

  React.useEffect(() => {
    if (!visible) setPassword("");
  }, [visible]);

  const canSubmit = !busy && password.length > 0;
  const close = () => {
    if (!busy) onCancel();
  };
  const submit = () => {
    if (canSubmit) onSubmit(password);
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.message}>{message}</Text>

            <Text style={styles.label}>Current password</Text>
            <TextInput
              style={[styles.input, error ? styles.inputError : undefined]}
              value={password}
              onChangeText={setPassword}
              placeholder="Current password"
              placeholderTextColor={colors.mutedText}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={submit}
              editable={!busy}
              autoFocus
              accessibilityLabel="Current password"
            />
            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <Pressable style={styles.cancelButton} onPress={close} disabled={busy}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmButton,
                  destructive ? styles.confirmDanger : undefined,
                  !canSubmit ? styles.confirmDisabled : undefined,
                ]}
                disabled={!canSubmit}
                onPress={submit}
                accessibilityRole="button"
              >
                <Text style={styles.confirmButtonText}>
                  {busy ? busyLabel || confirmLabel : confirmLabel}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: {
      flex: 1,
    },
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
    },
    title: {
      color: colors.text,
      fontSize: 20,
      fontFamily: fontFamilies.displaySemiBold,
    },
    message: {
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 6,
      fontFamily: fontFamilies.bodyMedium,
    },
    label: {
      color: colors.text,
      fontSize: 14,
      marginTop: 16,
      marginBottom: 8,
      fontFamily: fontFamilies.bodyBold,
    },
    input: {
      minHeight: 48,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 14,
      color: colors.text,
      fontFamily: fontFamilies.bodyMedium,
    },
    inputError: {
      borderColor: colors.danger,
    },
    error: {
      color: colors.danger,
      fontSize: 13,
      marginTop: 8,
      fontFamily: fontFamilies.bodySemiBold,
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
    confirmButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    confirmDanger: {
      backgroundColor: colors.danger,
    },
    confirmDisabled: {
      opacity: 0.45,
    },
    confirmButtonText: {
      color: "#fff",
      fontSize: 15,
      fontFamily: fontFamilies.displaySemiBold,
    },
  });
