import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

// Thin wrapper over expo-haptics: fire-and-forget, never throws, no-op on web. Simulators and
// devices without a haptic engine simply do nothing (the native call resolves or rejects; both
// are swallowed).

const supported = Platform.OS === "ios" || Platform.OS === "android";

function run(effect: () => Promise<void>) {
  if (!supported) return;
  try {
    effect().catch(() => {});
  } catch {
    // Native module missing (e.g. an old dev client): ignore.
  }
}

/** Light tap: long-press menu open, swipe-to-reply threshold. */
export function hapticLight() {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Selection tick: reaction pick, translate toggle. */
export function hapticSelection() {
  run(() => Haptics.selectionAsync());
}

/** Success notification: a message was sent. */
export function hapticSuccess() {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}
