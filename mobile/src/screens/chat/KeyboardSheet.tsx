import React, { useMemo } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { WarmColors } from "../../theme/warm";

type KeyboardSheetProps = {
  warm: WarmColors;
  visible: boolean;
  reduceMotion: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

/**
 * Bottom sheet for content with text inputs (group name, people search): like BottomSheet,
 * but it rises above the keyboard and caps its height so long lists scroll inside it.
 * RN's KeyboardAvoidingView is used inside the Modal (as ProfileScreen's edit modal does).
 */
export function KeyboardSheet({ warm, visible, reduceMotion, onClose, children }: KeyboardSheetProps) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(warm), [warm]);
  return (
    <Modal
      transparent
      visible={visible}
      animationType={reduceMotion ? "none" : "slide"}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: 14 + insets.bottom }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: warm.scrim,
    },
    sheet: {
      maxHeight: "88%",
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: warm.paper,
      paddingHorizontal: 16,
      paddingTop: 10,
      shadowColor: warm.shadow,
      shadowOpacity: 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: -6 },
      elevation: 12,
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 5,
      borderRadius: 999,
      backgroundColor: warm.line,
      marginBottom: 12,
    },
  });
