import React from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dismissToast, useToasts, type Toast } from "../services/toast";
import { useConnectivityStatus } from "../services/connectivity";
import { fontFamilies } from "../theme/typography";

const VARIANT_COLORS: Record<Toast["variant"], { background: string; border: string }> = {
  error: { background: "#7f1d1d", border: "#b91c1c" },
  success: { background: "#14532d", border: "#15803d" },
  info: { background: "#17324c", border: "#1b7f79" },
};

function ToastItem({ toast }: { toast: Toast }) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [opacity]);
  const palette = VARIANT_COLORS[toast.variant];
  const isError = toast.variant === "error";

  return (
    <Animated.View
      style={[styles.toast, { opacity, backgroundColor: palette.background, borderColor: palette.border }]}
      accessible
      accessibilityRole={isError ? "alert" : "text"}
      accessibilityLiveRegion={isError ? "assertive" : "polite"}
    >
      <View style={styles.toastBody}>
        {toast.title ? <Text style={styles.toastTitle}>{toast.title}</Text> : null}
        <Text style={styles.toastMessage}>{toast.message}</Text>
      </View>
      <Pressable
        onPress={() => dismissToast(toast.id)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
        hitSlop={10}
        style={styles.dismiss}
      >
        <Text style={styles.dismissText}>×</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Mounted once at the root: connectivity banner on top, toasts at the bottom. */
export function ToastHost() {
  const toasts = useToasts();
  const connectivity = useConnectivityStatus();
  const insets = useSafeAreaInsets();

  return (
    <>
      {connectivity !== "online" ? (
        <View
          pointerEvents="none"
          style={[styles.banner, { paddingTop: insets.top + 6 }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.bannerText}>
            {connectivity === "offline" ? "You're offline" : "Reconnecting…"}
          </Text>
        </View>
      ) : null}
      {toasts.length ? (
        <View pointerEvents="box-none" style={[styles.toastStack, { bottom: insets.bottom + 72 }]}>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} />
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 6,
    backgroundColor: "#92400e",
    alignItems: "center",
    zIndex: 1000,
    elevation: 10,
  },
  bannerText: {
    color: "#fff7ed",
    fontSize: 13,
    fontFamily: fontFamilies.bodySemiBold,
  },
  toastStack: {
    position: "absolute",
    left: 16,
    right: 16,
    gap: 8,
    zIndex: 1000,
    elevation: 10,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  toastBody: { flex: 1 },
  toastTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontFamily: fontFamilies.bodyBold,
    marginBottom: 2,
  },
  toastMessage: {
    color: "#f8fafc",
    fontSize: 14,
    fontFamily: fontFamilies.bodyMedium,
  },
  dismiss: { paddingHorizontal: 8, paddingVertical: 2 },
  dismissText: { color: "#f8fafc", fontSize: 20, lineHeight: 22 },
});
