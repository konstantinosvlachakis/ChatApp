import React, { useMemo } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { WarmColors } from "../../theme/warm";

type BottomSheetProps = {
  warm: WarmColors;
  visible: boolean;
  reduceMotion: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

/** Modal bottom sheet with a scrim (tap to close), a handle and safe-area bottom padding. */
export function BottomSheet({ warm, visible, reduceMotion, onClose, children }: BottomSheetProps) {
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
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: 14 + insets.bottom }]} accessibilityViewIsModal>
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
    handle: {
      alignSelf: "center",
      width: 40,
      height: 5,
      borderRadius: 999,
      backgroundColor: warm.line,
      marginBottom: 12,
    },
  });
