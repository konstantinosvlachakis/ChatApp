import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { WarmColors } from "../../theme/warm";
import { useReducedMotion } from "./useReducedMotion";

export const SEND_BUTTON_SIZE = 44;

type SendButtonProps = {
  warm: WarmColors;
  /** There is something to send: the button grows in; otherwise it collapses out of the row. */
  visible: boolean;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
};

/** Round navy send button that animates in when the draft has content (instant with reduced motion). */
export function SendButton({ warm, visible, disabled = false, busy = false, accessibilityLabel, onPress }: SendButtonProps) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    const toValue = visible ? 1 : 0;
    if (reduceMotion) {
      progress.setValue(toValue);
      return;
    }
    // Width is animated, so this can't use the native driver; it only runs when `visible` flips.
    const animation = Animated.timing(progress, {
      toValue,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion, visible]);

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={{
        width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, SEND_BUTTON_SIZE] }),
        marginLeft: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }),
        opacity: progress,
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
      }}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
    >
      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          onPress();
        }}
        disabled={disabled || !visible}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: warm.navy },
          (disabled || busy) && styles.dimmed,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: disabled || !visible, busy }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={warm.onNavy} />
        ) : (
          <Ionicons name="arrow-up" size={22} color={warm.onNavy} />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: SEND_BUTTON_SIZE,
    height: SEND_BUTTON_SIZE,
    borderRadius: SEND_BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dimmed: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.85,
  },
});
