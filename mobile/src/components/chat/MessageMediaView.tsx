import React from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import type { ChatMessage, GifMedia, StickerMedia } from "../../types";
import { gifBoxSize, isOpenableUrl } from "./attachments";
import type { ChatStyles } from "./chatStyles";
import { useReducedMotion } from "./useReducedMotion";

export const STICKER_SIZE = 132;

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
