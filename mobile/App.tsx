import "react-native-gesture-handler";
import React from "react";
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
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
import { CoachAvatar } from "./src/components/CoachAvatar";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { fontFamilies } from "./src/theme/typography";
import { ToastHost } from "./src/components/ToastHost";
import { initMonitoring, wrapRoot } from "./src/services/monitoring";
import { initNotifications } from "./src/services/push";

/**
 * Launch: the native splash (app.json `expo-splash-screen`, logo on the launch navy) stays up
 * until fonts load, then LaunchScreen takes over on the same navy: its content fades in,
 * holds, and slides out over the first screen once auth has settled.
 * Keep `background` in sync with the splash `backgroundColor` in app.json.
 */
const LAUNCH = {
  background: "#081320",
  // The launch screen stays at least this long, then leaves once the app is ready.
  minVisibleMs: 1550,
  // Leave anyway if auth or the theme never settle.
  safetyTimeoutMs: 6000,
} as const;

// Must run before the first render, or the native splash may already be gone.
SplashScreen.preventAutoHideAsync().catch(() => {});

// No-op unless EXPO_PUBLIC_SENTRY_DSN is set at build time.
initMonitoring();
// Foreground handler, Android channel and notification-tap listener (cold starts too).
initNotifications();

function LaunchScreen({ ready, onHidden }: { ready: boolean; onHidden: () => void }) {
  const { width } = useWindowDimensions();
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(22)).current;
  const translateX = React.useRef(new Animated.Value(0)).current;
  const scale = React.useRef(new Animated.Value(0.95)).current;
  const [minElapsed, setMinElapsed] = React.useState(false);
  const [timedOut, setTimedOut] = React.useState(false);
  const exitStartedRef = React.useRef(false);

  // The backdrop is the native splash's colour, so hiding it once this is laid out is seamless.
  const handleLayout = React.useCallback(() => {
    SplashScreen.hide();
  }, []);

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 680,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 760,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 68,
        useNativeDriver: true,
      }),
    ]).start();
    const minTimer = setTimeout(() => setMinElapsed(true), LAUNCH.minVisibleMs);
    const safetyTimer = setTimeout(() => setTimedOut(true), LAUNCH.safetyTimeoutMs);
    return () => {
      clearTimeout(minTimer);
      clearTimeout(safetyTimer);
    };
  }, [opacity, scale, translateY]);

  React.useEffect(() => {
    if (exitStartedRef.current || !((minElapsed && ready) || timedOut)) return;
    exitStartedRef.current = true;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 520,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: Math.min(width * 0.38, 180),
        duration: 620,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.985,
        duration: 620,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => onHidden());
  }, [minElapsed, onHidden, opacity, ready, scale, timedOut, translateX, width]);

  return (
    <View
      style={launchStyles.backdrop}
      onLayout={handleLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={launchStyles.glowA} />
      <View style={launchStyles.glowB} />
      <View style={launchStyles.glowC} />
      <Animated.View
        style={[
          launchStyles.centerWrap,
          { opacity, transform: [{ translateX }, { translateY }, { scale }] },
        ]}
      >
        <View style={launchStyles.logoPlate}>
          <CoachAvatar size={96} hideBadge />
        </View>
        <Text style={launchStyles.title}>LangVoyage</Text>
        <Text style={launchStyles.tagline}>Speak with confidence, every day.</Text>
      </Animated.View>
    </View>
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
      {/* The launch screen's title uses the custom fonts; until they load the native splash stays up. */}
      {launchDone || !fontsReady ? null : <LaunchScreen ready={ready} onHidden={handleLaunchHidden} />}
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
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: LAUNCH.background,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  glowA: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(19, 122, 115, 0.32)",
    top: -40,
    left: -90,
  },
  glowB: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(241, 182, 210, 0.28)",
    right: -50,
    top: 90,
  },
  glowC: {
    position: "absolute",
    width: 360,
    height: 180,
    borderRadius: 999,
    backgroundColor: "rgba(23, 50, 76, 0.72)",
    bottom: -50,
    alignSelf: "center",
  },
  centerWrap: {
    alignItems: "center",
    paddingHorizontal: 28,
  },
  logoPlate: {
    padding: 10,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  title: {
    marginTop: 22,
    color: "#f8fafc",
    fontSize: 32,
    fontFamily: fontFamilies.displayBold,
    letterSpacing: 0.4,
  },
  tagline: {
    marginTop: 8,
    color: "rgba(226,232,240,0.82)",
    fontSize: 15,
    fontFamily: fontFamilies.bodyMedium,
    textAlign: "center",
    letterSpacing: 0.2,
  },
});
