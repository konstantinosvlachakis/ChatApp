import React from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import Animated, { Keyframe, ReduceMotion } from "react-native-reanimated";
import type { ChatMessage, GifMedia, StickerMedia } from "../../types";
import { gifBoxSize, isOpenableUrl } from "./attachments";
import type { ChatStyles } from "./chatStyles";
import { useReducedMotion } from "./useReducedMotion";

export const STICKER_SIZE = 132;

/**
 * A new sticker pops in with a small wiggle. expo-image draws the SVG's rest pose only (the web
 * plays the CSS animation inside the file). As an entering animation it runs only for messages
 * added while the chat is open (MessageRow's LayoutAnimationConfig skips virtualized re-mounts)
 * and not at all with Reduce Motion.
 */
const STICKER_POP = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.4 }, { rotate: "-12deg" }] },
  45: { opacity: 1, transform: [{ scale: 1.12 }, { rotate: "6deg" }] },
  72: { transform: [{ scale: 0.96 }, { rotate: "-3deg" }] },
  100: { opacity: 1, transform: [{ scale: 1 }, { rotate: "0deg" }] },
})
  .duration(560)
  .reduceMotion(ReduceMotion.System);

export const isMediaMessage = (message: Pick<ChatMessage, "kind"> | null | undefined) =>
  message?.kind === "sticker" || message?.kind === "gif";

function GifView({ gif, styles, itemKey }: { gif: GifMedia; styles: ChatStyles; itemKey: string }) {
  const reduceMotion = useReducedMotion();
  // Reduce motion: show GIPHY's still frame instead of the animation.
  const uri = reduceMotion && isOpenableUrl(gif.still_url) ? gif.still_url : gif.url;
  if (!isOpenableUrl(uri)) return <Text style={styles.mediaFallback}>GIF</Text>;
  return (
    <Image
      source={{ uri: uri as string }}
      style={[styles.gifImage, gifBoxSize(Number(gif.width), Number(gif.height))]}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={itemKey}
      transition={120}
      accessible
      accessibilityLabel={gif.title ? `GIF: ${gif.title}` : "GIF"}
      accessibilityIgnoresInvertColors
    />
  );
}

function StickerView({ sticker, styles, itemKey }: { sticker: StickerMedia; styles: ChatStyles; itemKey: string }) {
  const label = sticker.label || "Sticker";
  if (!isOpenableUrl(sticker.url)) {
    return (
      <View style={styles.mediaFallbackBox}>
        <Text style={styles.mediaFallback}>Sticker · {label}</Text>
      </View>
    );
  }
  return (
    <Animated.View entering={STICKER_POP}>
      <Image
        source={{ uri: sticker.url as string }}
        style={{ width: STICKER_SIZE, height: STICKER_SIZE }}
        contentFit="contain"
        cachePolicy="memory-disk"
        recyclingKey={itemKey}
        accessible
        accessibilityLabel={`Sticker: ${label}`}
        accessibilityIgnoresInvertColors
      />
    </Animated.View>
  );
}

/** Sticker or GIF content of a message (drawn without a bubble fill). */
export function MessageMediaView({ message, styles }: { message: ChatMessage; styles: ChatStyles }) {
  const itemKey = message.local_key || String(message.id);
  if (message.kind === "sticker" && message.media) {
    return <StickerView sticker={message.media as StickerMedia} styles={styles} itemKey={itemKey} />;
  }
  if (message.kind === "gif" && message.media) {
    return <GifView gif={message.media as GifMedia} styles={styles} itemKey={itemKey} />;
  }
  return <Text style={styles.mediaFallback}>{message.kind === "gif" ? "GIF" : "Sticker"}</Text>;
}
