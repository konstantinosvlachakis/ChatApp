import "react-native-gesture-handler";
import React from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
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
import { AuthProvider } from "./src/context/AuthContext";
import { CoachAvatar } from "./src/components/CoachAvatar";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { fontFamilies } from "./src/theme/typography";

function LaunchScreen({
  visible,
  onHidden,
  freezeForDebug = false,
}: {
  visible: boolean;
  onHidden?: () => void;
  freezeForDebug?: boolean;
}) {
  const { width } = useWindowDimensions();
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(16)).current;
  const translateX = React.useRef(new Animated.Value(0)).current;
  const scale = React.useRef(new Animated.Value(0.96)).current;
  const hasAnimatedInRef = React.useRef(false);
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!visible) {
      opacity.stopAnimation();
      translateY.stopAnimation();
      translateX.stopAnimation();
      scale.stopAnimation();
      hasAnimatedInRef.current = false;
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      return;
    }

    opacity.setValue(0);
    translateY.setValue(22);
    translateX.setValue(0);
    scale.setValue(0.95);
    hasAnimatedInRef.current = true;

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

    if (freezeForDebug) {
      return () => {
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
      };
    }

    hideTimerRef.current = setTimeout(() => {
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
      ]).start(({ finished }) => {
        if (finished && hasAnimatedInRef.current) {
          onHidden?.();
        }
      });
    }, 1550);

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [freezeForDebug, onHidden, opacity, scale, translateX, translateY, visible, width]);

  if (!visible) return null;

  return (
    <View style={launchStyles.backdrop}>
      <View style={launchStyles.glowA} />
      <View style={launchStyles.glowB} />
      <View style={launchStyles.glowC} />
      <Animated.View
        style={[
          launchStyles.centerWrap,
          {
            opacity,
            transform: [{ translateX }, { translateY }, { scale }],
          },
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

function AppContent() {
  const { colors, isDark } = useTheme();
  const freezeLaunchForDebug = false;
  const [showLaunch, setShowLaunch] = React.useState(true);
  const handleLaunchHidden = React.useCallback(() => {
    if (freezeLaunchForDebug) return;
    setShowLaunch(false);
  }, [freezeLaunchForDebug]);
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
    <View style={{ flex: 1 }}>
      <NavigationContainer theme={navigationTheme}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <RootNavigator />
      </NavigationContainer>
      <LaunchScreen
        visible={showLaunch}
        freezeForDebug={freezeLaunchForDebug}
        onHidden={handleLaunchHidden}
      />
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const launchStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#081320",
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
