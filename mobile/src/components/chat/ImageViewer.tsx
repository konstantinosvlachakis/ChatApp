import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 1.2;

type ImageViewerProps = {
  /** Original (untransformed) image URL; null hides the viewer. */
  url: string | null;
  onClose: () => void;
};

/** Full-screen photo viewer: close button, Android back, or swipe down to dismiss. */
export function ImageViewer({ url, onClose }: ImageViewerProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    translateY.setValue(0);
    setLoading(true);
    setFailed(false);
  }, [translateY, url]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => {
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
            onCloseRef.current();
            return;
          }
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [translateY]
  );

  const backdropOpacity = translateY.interpolate({
    inputRange: [0, 300],
    outputRange: [1, 0.3],
    extrapolate: "clamp",
  });

  return (
    <Modal
      visible={Boolean(url)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={["portrait", "landscape"]}
    >
      <Animated.View style={[viewerStyles.backdrop, { opacity: backdropOpacity }]} />
      <Animated.View
        style={[viewerStyles.content, { transform: [{ translateY }] }]}
        {...panResponder.panHandlers}
      >
        {url && !failed ? (
          <Image
            source={{ uri: url }}
            style={viewerStyles.image}
            resizeMode="contain"
            onLoadEnd={() => setLoading(false)}
            onError={() => setFailed(true)}
            accessible
            accessibilityRole="image"
            accessibilityLabel="Photo, full screen. Swipe down to close"
            accessibilityIgnoresInvertColors
          />
        ) : null}
        {loading && !failed ? (
          <View style={viewerStyles.center} pointerEvents="none">
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : null}
        {failed ? (
          <View style={viewerStyles.center} pointerEvents="none">
            <Ionicons name="image-outline" size={40} color="#cbd5e1" />
            <Text style={viewerStyles.errorText}>Could not load this photo.</Text>
          </View>
        ) : null}
      </Animated.View>
      <Pressable
        onPress={onClose}
        style={[viewerStyles.closeButton, { top: insets.top + 12 }]}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Close photo"
      >
        <Ionicons name="close" size={26} color="#fff" />
      </Pressable>
    </Modal>
  );
}

const viewerStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  errorText: {
    color: "#cbd5e1",
    fontSize: 14,
  },
  closeButton: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
});
