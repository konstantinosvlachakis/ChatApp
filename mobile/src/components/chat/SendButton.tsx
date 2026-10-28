import React, { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet } from "react-native";
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
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
  const progress = useSharedValue(visible ? 1 : 0);

  // Runs on the UI thread (Reanimated); instant with the OS reduce-motion setting.
  useEffect(() => {
    const toValue = visible ? 1 : 0;
    progress.value = reduceMotion
      ? toValue
      : withTiming(toValue, { duration: 160, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System });
  }, [progress, reduceMotion, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [0, SEND_BUTTON_SIZE]),
    marginLeft: interpolate(progress.value, [0, 1], [0, 8]),
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.6, 1]) }],
  }));

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={animatedStyle}
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
