import "react-native-gesture-handler";
import React from "react";
import { StyleSheet, View } from "react-native";
import { isRunningInExpoGo } from "expo";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { useFonts } from "expo-font";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Sora_600SemiBold, Sora_700Bold } from "@expo-google-fonts/sora";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { ToastHost } from "./src/components/ToastHost";
import { initMonitoring, wrapRoot } from "./src/services/monitoring";
import { initNotifications } from "./src/services/push";

/**
 * Launch hand-off. The native splash (app.json `expo-splash-screen` plugin) draws
 * `assets/splash.png` at `imageWidth` dp, centred in the full window, on `background`.
 * The JS overlay draws the same image at the same size and centre, so the hide is
 * invisible; then it animates out over the first real screen.
 * Keep `background` / `imageSize` in sync with app.json.
 */
const LAUNCH = {
  background: "#0d1c2b",
  // = app.json imageWidth. splash.png is a 1024 canvas with a 512 px tile, so the tile is 120 dp.
  imageSize: 240,
  // After hiding the native splash, let it go before the overlay starts moving.
  holdMs: 120,
  dipScale: 0.92,
  dipMs: 180,
  growScale: 1.15,
  growMs: 360,
  fadeDelayMs: 180,
  fadeMs: 360, // total exit: fadeDelayMs + fadeMs = 540 ms
  reducedFadeMs: 150,
  // Hide the native splash even if fonts/auth/theme never settle.
  safetyTimeoutMs: 6000,
} as const;

const SPLASH_IMAGE = require("./assets/splash.png");

// Must run before the first render, or the native splash may already be gone.
SplashScreen.preventAutoHideAsync().catch(() => {});
if (!isRunningInExpoGo()) {
  // The overlay underneath is identical, so drop the native fade (Android defaults to 400 ms).
  SplashScreen.setOptions({ duration: 0, fade: false });
}

// No-op unless EXPO_PUBLIC_SENTRY_DSN is set at build time.
initMonitoring();
// Foreground handler, Android channel and notification-tap listener (cold starts too).
initNotifications();

function LaunchOverlay({ ready, onHidden }: { ready: boolean; onHidden: () => void }) {
  const reduceMotion = useReducedMotion();
  const [laidOut, setLaidOut] = React.useState(false);
  const [logoShown, setLogoShown] = React.useState(false);
  const [timedOut, setTimedOut] = React.useState(false);
  const [exiting, setExiting] = React.useState(false);
  const nativeHiddenRef = React.useRef(false);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  React.useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), LAUNCH.safetyTimeoutMs);
    return () => clearTimeout(timer);
  }, []);

  // Painted = the overlay is laid out and its logo is on screen (or loading it failed / timed out).
  const painted = laidOut && (logoShown || timedOut);
  // After the safety timeout, reveal whatever is underneath (e.g. RootNavigator's
  // "Starting app..." if the auth bootstrap still hangs) rather than staying on the splash.
  const reveal = (ready && painted) || timedOut;

  // Hide the native splash exactly once, when the app is ready behind an identical overlay
  // (or on the safety timeout). hide() itself is idempotent too.
  React.useEffect(() => {
    if (nativeHiddenRef.current || !reveal) return;
    nativeHiddenRef.current = true;
    SplashScreen.hide();
  }, [reveal]);

  React.useEffect(() => {
    if (!reveal || exiting) return;
    const timer = setTimeout(() => setExiting(true), LAUNCH.holdMs);
    return () => clearTimeout(timer);
  }, [exiting, reveal]);

  React.useEffect(() => {
    if (!exiting) return;
    const finish = (finished?: boolean) => {
      "worklet";
      if (finished) scheduleOnRN(onHidden);
    };
    if (reduceMotion) {
      opacity.value = withTiming(
        0,
        { duration: LAUNCH.reducedFadeMs, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never },
        finish
      );
    } else {
      scale.value = withSequence(
        withTiming(LAUNCH.dipScale, { duration: LAUNCH.dipMs, easing: Easing.out(Easing.quad) }),
        withTiming(LAUNCH.growScale, { duration: LAUNCH.growMs, easing: Easing.out(Easing.cubic) })
      );
      opacity.value = withDelay(
        LAUNCH.fadeDelayMs,
        withTiming(0, { duration: LAUNCH.fadeMs, easing: Easing.out(Easing.cubic) }, finish)
      );
    }
    // Unmount even if the animation is interrupted.
    const total = reduceMotion ? LAUNCH.reducedFadeMs : LAUNCH.fadeDelayMs + LAUNCH.fadeMs;
    const fallback = setTimeout(onHidden, total + 300);
    return () => clearTimeout(fallback);
  }, [exiting, onHidden, opacity, reduceMotion, scale]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[launchStyles.backdrop, backdropStyle, { pointerEvents: exiting ? "none" : "auto" }]}
      onLayout={() => setLaidOut(true)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[launchStyles.logo, logoStyle]}>
        <Image
          source={SPLASH_IMAGE}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={null}
          onDisplay={() => setLogoShown(true)}
          onError={() => setLogoShown(true)}
        />
      </Animated.View>
    </Animated.View>
  );
}

function AppContent({ fontsReady }: { fontsReady: boolean }) {
  const { colors, isDark, hydrated: themeReady } = useTheme();
  const { loading: authLoading } = useAuth();
  const [launchDone, setLaunchDone] = React.useState(false);
  const handleLaunchHidden = React.useCallback(() => setLaunchDone(true), []);
  const ready = fontsReady && themeReady && !authLoading;
  const navigationTheme = React.useMemo(
    () =>
      isDark
        ? {
            ...NavigationDarkTheme,
            colors: {
              ...NavigationDarkTheme.colors,
              background: colors.background,
              card: colors.surface,
              text: colors.text,
              border: colors.border,
              primary: colors.primary,
            },
          }
        : {
            ...NavigationDefaultTheme,
            colors: {
              ...NavigationDefaultTheme.colors,
              background: colors.background,
              card: colors.surface,
              text: colors.text,
              border: colors.border,
              primary: colors.primary,
            },
          },
    [colors.background, colors.border, colors.primary, colors.surface, colors.text, isDark]
  );
  return (
    // Opaque themed root: nothing white/black shows behind the fading overlay or screen transitions.
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Light icons over the navy overlay; the theme's style once it is gone. */}
      <StatusBar style={launchDone ? (isDark ? "light" : "dark") : "light"} />
      {fontsReady ? (
        <NavigationContainer theme={navigationTheme}>
          <RootNavigator />
        </NavigationContainer>
      ) : null}
      {fontsReady ? <ToastHost /> : null}
      {launchDone ? null : <LaunchOverlay ready={ready} onHidden={handleLaunchHidden} />}
    </View>
  );
}

function App() {
  const [fontsLoaded, fontError] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  // A font failure falls back to system fonts rather than blocking launch.
  const fontsReady = fontsLoaded || Boolean(fontError);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Frame-by-frame keyboard events (chat composer + lists, auth forms) on iOS and Android. */}
      <KeyboardProvider>
        {/* initialMetrics: correct insets on the first frame, so screens don't shift under the overlay. */}
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <ThemeProvider>
            <AuthProvider>
              <AppContent fontsReady={fontsReady} />
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(App);

const launchStyles = StyleSheet.create({
  // Root views are edge-to-edge (full window incl. status/navigation bars), the same box the
  // native splash centres in on Android and iOS, so plain centring matches it.
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: LAUNCH.background,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: LAUNCH.imageSize,
    height: LAUNCH.imageSize,
  },
});
