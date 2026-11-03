import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { fontFamilies } from "../../theme/typography";
import { warmColors, type WarmColors } from "../../theme/warm";
import type { PeopleCard } from "../../types";
import { PhotoExchangeCard } from "./PhotoExchangeCard";

/** Signed distance from the front card on a loop (web `loopOffset`): the last card sits left of the first. */
export const loopOffset = (position: number, index: number, count: number) => {
  if (count < 3) return position - index;
  const forward = (((position - index) % count) + count) % count;
  return forward > count / 2 ? forward - count : forward;
};

// Night journey backdrop (web backdrop K): a mirrored gradient from the screen colour at both
// edges to navy in the middle, drawn as thin vertical bands (no gradient package needed).
const NIGHT = "#13263a";
const BANDS = 31;
// Top and bottom fade back to the screen colour over this many rows (each FADE_ROW_DP tall).
const FADE_ROWS = 10;
const FADE_ROW_DP = 4;
const FADE_OPACITY = Array.from({ length: FADE_ROWS }, (_, i) => {
  const t = i / (FADE_ROWS - 1); // 0 at the edge, 1 inside
  return 1 - t * t * (3 - 2 * t);
});

const mixHex = (from: string, to: string, amount: number) => {
  const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
  const mixed = [1, 3, 5].map((at) => Math.round(channel(from, at) + (channel(to, at) - channel(from, at)) * amount));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
};

/** Band colours: 0 at the edges, 1 (navy) in the middle, eased so the middle stays deep. */
const bandColors = (edge: string) =>
  Array.from({ length: BANDS }, (_, i) => {
    const distance = Math.abs(i - (BANDS - 1) / 2) / ((BANDS - 1) / 2); // 1 at the edges, 0 in the middle
    const depth = 1 - distance * distance * (3 - 2 * distance); // smoothstep
    return mixHex(edge, NIGHT, depth);
  });
const STARS = Array.from({ length: 34 }, (_, i) => ({
  // Only over the navy middle: white dots would show on the light edges.
  left: `${25 + ((i * 37) % 50)}%` as const,
  top: `${(i * 53 + 11) % 100}%` as const,
  size: i % 3 === 0 ? 2.5 : 1.5,
  opacity: i % 3 === 0 ? 0.45 : 0.25,
}));

/** A horizontal swipe longer than this (dp) moves one card. */
const SWIPE_DP = 40;

type Props = {
  profiles: PeopleCard[];
  viewerLanguage: string;
  startingUsername: string;
  onSayHello: (username: string) => void;
  onViewProfile: (profile: PeopleCard) => void;
  /** The front card is one of the last two loaded: load the next page of perfect exchanges. */
  onEndReached?: () => void;
};

type SlideProps = {
  offset: number;
  shift: number;
  reduceMotion: boolean;
  onLayoutHeight?: (height: number) => void;
  children: React.ReactNode;
  left: number;
};

/** One card, animated to its place: front (offset 0), behind on either side (±1), or gone. */
function CoverflowSlide({ offset, shift, reduceMotion, onLayoutHeight, children, left }: SlideProps) {
  const position = useRef(new Animated.Value(offset)).current;
  useEffect(() => {
    if (reduceMotion) {
      position.setValue(offset);
      return;
    }
    Animated.timing(position, { toValue: offset, duration: 320, useNativeDriver: true }).start();
  }, [offset, position, reduceMotion]);

  const range = [-2, -1, 0, 1, 2];
  const front = offset === 0;
  return (
    <Animated.View
      pointerEvents={front ? "auto" : "none"}
      importantForAccessibility={front ? "auto" : "no-hide-descendants"}
      accessibilityElementsHidden={!front}
      onLayout={onLayoutHeight ? (event) => onLayoutHeight(event.nativeEvent.layout.height) : undefined}
      style={[
        styles.slide,
        {
          left,
          zIndex: 3 - Math.min(Math.abs(offset), 2),
          opacity: position.interpolate({ inputRange: range, outputRange: [0, 1, 1, 1, 0], extrapolate: "clamp" }),
          transform: [
            { translateX: position.interpolate({ inputRange: range, outputRange: [-shift * 1.7, -shift, 0, shift, shift * 1.7], extrapolate: "clamp" }) },
            { scale: position.interpolate({ inputRange: range, outputRange: [0.66, 0.8, 1, 0.8, 0.66], extrapolate: "clamp" }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Perfect exchanges as a coverflow (web PerfectExchangeCarousel): one card in front, the
 * previous and next ones smaller behind it, on a navy night-sky panel. Swipe, tap a
 * side card, or use the arrows below. From three matches up it loops.
 */
export function PerfectMatchesRail({ profiles, viewerLanguage, startingUsername, onSayHello, onViewProfile, onEndReached }: Props) {
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const warm = warmColors(isDark);
  const themed = useMemo(() => createThemedStyles(warm), [warm]);
  const bands = useMemo(() => bandColors(/^#[0-9a-f]{6}$/i.test(warm.cream) ? warm.cream : "#f7f6f2"), [warm.cream]);
  const cardWidth = Math.round(Math.min(width * 0.6, 260));
  const shift = Math.round(cardWidth * 0.58);
  // The stage is inset 16dp each side (styles.stageShadow).
  const left = Math.round((width - 32 - cardWidth) / 2);
  const [index, setIndex] = useState(0);
  const [height, setHeight] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const count = profiles.length;
  const last = Math.max(count - 1, 0);
  const loops = count >= 3;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => mounted && setReduceMotion(value)).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  // A shorter list (search, filter) must not leave the index past the end.
  useEffect(() => {
    setIndex((current) => Math.min(current, last));
  }, [last]);

  useEffect(() => {
    if (count && index >= count - 2) onEndReached?.();
  }, [index, count, onEndReached]);

  const goTo = (next: number) => setIndex(loops ? ((next % count) + count) % count : Math.max(0, Math.min(next, last)));
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  const indexRef = useRef(index);
  indexRef.current = index;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_event, gesture) => {
          if (Math.abs(gesture.dx) >= SWIPE_DP) goToRef.current(indexRef.current + (gesture.dx < 0 ? 1 : -1));
        },
      }),
    []
  );

  if (!count) return null;

  return (
    <View style={styles.section}>
      <View style={styles.stageShadow}>
        <View style={[styles.stage, { height: height || cardWidth * 1.5 }]} {...pan.panHandlers} accessibilityLabel="Perfect exchanges">
          <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.bands}>
            {bands.map((color, i) => (
              <View key={i} style={[styles.band, { backgroundColor: color }]} />
            ))}
          </View>
          {(["top", "bottom"] as const).map((side) => (
            <View key={side} style={[styles.fade, side === "top" ? styles.fadeTop : styles.fadeBottom]}>
              {(side === "top" ? FADE_OPACITY : [...FADE_OPACITY].reverse()).map((opacity, i) => (
                <View key={i} style={{ height: FADE_ROW_DP, backgroundColor: warm.cream, opacity }} />
              ))}
            </View>
          ))}
          <View style={[styles.glow, { width: cardWidth * 1.5, height: cardWidth * 1.5, borderRadius: cardWidth * 0.75, left: left - cardWidth * 0.25 }]} />
            {STARS.map((star, i) => (
              <View key={i} style={[styles.star, { left: star.left, top: star.top, width: star.size, height: star.size, opacity: star.opacity }]} />
            ))}
          </View>
          {profiles.map((profile, position) => {
            const offset = loopOffset(position, index, count);
            if (Math.abs(offset) > 2) return null;
            return (
              <CoverflowSlide
                key={profile.username}
                offset={offset}
                shift={shift}
                left={left}
                reduceMotion={reduceMotion}
                onLayoutHeight={offset === 0 ? (value) => setHeight((current) => (Math.abs(current - value - 60) > 1 ? value + 60 : current)) : undefined}
              >
                <View accessibilityLabel={`${position + 1} of ${count}: ${profile.username}`}>
                  <PhotoExchangeCard
                    profile={profile}
                    width={cardWidth}
                    viewerLanguage={viewerLanguage}
                    busy={Boolean(startingUsername)}
                    starting={startingUsername === profile.username}
                    onSayHello={onSayHello}
                    onViewProfile={onViewProfile}
                  />
                </View>
              </CoverflowSlide>
            );
          })}
          {/* Tap targets over the cards behind; screen readers use the arrows below. */}
          {loops || index > 0 ? (
            <Pressable style={[styles.peek, { left: 0, width: left }]} onPress={() => goTo(index - 1)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          ) : null}
          {loops || index < last ? (
            <Pressable style={[styles.peek, { right: 0, width: left }]} onPress={() => goTo(index + 1)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          ) : null}
        </View>
      </View>
      {count > 1 ? (
        <View style={styles.controls}>
          <Pressable
            onPress={() => goTo(index - 1)}
            disabled={!loops && index === 0}
            accessibilityRole="button"
            accessibilityLabel="Previous match"
            accessibilityState={{ disabled: !loops && index === 0 }}
            style={({ pressed }) => [themed.arrow, !loops && index === 0 && styles.arrowDisabled, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={18} color={warm.ink} />
          </Pressable>
          <Text style={themed.counter} accessibilityLiveRegion="polite">{index + 1} of {count}</Text>
          <Pressable
            onPress={() => goTo(index + 1)}
            disabled={!loops && index >= last}
            accessibilityRole="button"
            accessibilityLabel="Next match"
            accessibilityState={{ disabled: !loops && index >= last }}
            style={({ pressed }) => [themed.arrow, !loops && index >= last && styles.arrowDisabled, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-forward" size={18} color={warm.ink} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: -16 },
  stage: { position: "relative", overflow: "hidden" },
  bands: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, flexDirection: "row" },
  band: { flex: 1 },
  fade: { position: "absolute", left: 0, right: 0, zIndex: 1 },
  fadeTop: { top: 0 },
  fadeBottom: { bottom: 0 },
  // The stage melts into the screen at both edges, so it has no shadow or border.
  stageShadow: { marginHorizontal: 16 },
  glow: { position: "absolute", top: "8%", backgroundColor: "#f5cfb1", opacity: 0.1 },
  star: { position: "absolute", borderRadius: 2, backgroundColor: "#fffaf3" },
  slide: { position: "absolute", top: 30 },
  peek: { position: "absolute", top: 0, bottom: 0, zIndex: 10 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 4 },
  arrowDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
});

const createThemedStyles = (warm: WarmColors) =>
  StyleSheet.create({
    arrow: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: warm.lineWarm, backgroundColor: warm.paper },
    counter: { minWidth: 56, textAlign: "center", color: warm.mutedInk, fontSize: 13, fontFamily: fontFamilies.bodyBold },
  });
