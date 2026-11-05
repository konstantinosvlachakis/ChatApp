import React, { useMemo } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { WarmColors } from "../../theme/warm";

type BottomSheetProps = {
  warm: WarmColors;
  visible: boolean;
  reduceMotion: boolean;
  onClose: () => void;
  /** Dim the screen behind the sheet (default). Without it the sheet floats on a clear backdrop. */
  scrim?: boolean;
  children: React.ReactNode;
};

/** Modal bottom sheet with a scrim (tap outside to close), a handle and safe-area bottom padding. */
export function BottomSheet({ warm, visible, reduceMotion, onClose, scrim = true, children }: BottomSheetProps) {
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
      <View style={[styles.overlay, !scrim && styles.overlayClear]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View
          style={[styles.sheet, !scrim && styles.sheetFlat, { paddingBottom: 14 + insets.bottom }]}
          accessibilityViewIsModal
        >
          <View style={styles.handle} />
          {children}
        </View>
      </View>
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
    overlayClear: {
      backgroundColor: "transparent",
    },
    sheet: {
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
    // No scrim and no cast shadow: a hairline edge separates the sheet from the chat.
    sheetFlat: {
      shadowOpacity: 0,
      elevation: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderColor: warm.line,
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
