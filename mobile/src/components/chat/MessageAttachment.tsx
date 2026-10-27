import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { showToast } from "../../services/toast";
import type { WarmColors } from "../../theme/warm";
import { audioPlaybackUrl, cloudinaryImage } from "../../utils/media";
import {
  attachmentFileName,
  attachmentLabel,
  formatDuration,
  isOpenableUrl,
  type AttachmentKind,
} from "./attachments";
import { useChatAudioController, useChatAudioState } from "./audioController";
import type { ChatStyles } from "./chatStyles";

/** Rendered size (dp) of the image box inside a bubble; fixed so rows never jump on load. */
export const CHAT_IMAGE_BOX_WIDTH = 220;
export const CHAT_IMAGE_BOX_HEIGHT = 240;

type AttachmentProps = {
  messageId: number;
  url: string;
  kind: AttachmentKind;
  isPending: boolean;
  styles: ChatStyles;
  warm: WarmColors;
  onOpenImage: (url: string) => void;
  onLongPress: (pageY: number) => void;
};

function openExternally(url: string) {
  if (!isOpenableUrl(url)) {
    showToast("This attachment can't be opened.", { variant: "error" });
    return;
  }
  Linking.openURL(url).catch(() => {
    showToast("Couldn't open this attachment.", { variant: "error" });
  });
}

function ImageAttachment({ url, isPending, styles, warm, onOpenImage, onLongPress }: AttachmentProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Cloudinary resize to the box width (× pixel ratio, capped at 3); other URLs unchanged.
  const source = useMemo(
    () => ({ uri: cloudinaryImage(url, { width: CHAT_IMAGE_BOX_WIDTH, crop: "limit" }) }),
    [url]
  );

  return (
    <Pressable
      style={styles.attachmentImageBox}
      onPress={(event) => {
        event.stopPropagation();
        if (!isPending) onOpenImage(url);
      }}
      onLongPress={(event) => onLongPress(event.nativeEvent.pageY)}
      delayLongPress={520}
      accessibilityRole="imagebutton"
      accessibilityLabel={isPending ? "Photo, sending" : "Photo"}
      accessibilityHint={isPending ? undefined : "Opens the photo full screen"}
    >
      {!failed ? (
        <Image
          source={source}
          style={styles.attachmentImage}
          resizeMode="contain"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      {!loaded && !failed ? (
        <View style={styles.attachmentImageOverlay} pointerEvents="none">
          <ActivityIndicator color={warm.mutedInk} />
        </View>
      ) : null}
      {failed ? (
        <View style={styles.attachmentImageOverlay} pointerEvents="none">
          <Ionicons name="image-outline" size={28} color={warm.mutedInk} />
          <Text style={styles.attachmentImageErrorText}>Photo unavailable</Text>
        </View>
      ) : null}
      {isPending ? (
        <View style={[styles.attachmentImageOverlay, styles.attachmentImageSending]} pointerEvents="none">
          <ActivityIndicator color={warm.onImageScrim} />
        </View>
      ) : null}
    </Pressable>
  );
}

function VoiceNoteAttachment({ messageId, url, isPending, styles, warm, onLongPress }: AttachmentProps) {
  const controller = useChatAudioController();
  const key = String(messageId);
  const state = useChatAudioState(key);
  const playbackUrl = useMemo(() => audioPlaybackUrl(url), [url]);
  const isActive = state.activeKey === key;
  const progress = isActive && state.duration > 0 ? Math.min(1, state.currentTime / state.duration) : 0;
  const tint = warm.teal;

  // A deleted (or far-scrolled, virtualized) row must not keep playing invisibly.
  useEffect(
    () => () => {
      if (controller?.getState().activeKey === key) controller.release();
    },
    [controller, key]
  );

  const handlePress = useCallback(() => {
    if (isPending) return;
    if (state.error) {
      openExternally(url);
      return;
    }
    controller?.toggle(key, playbackUrl);
  }, [controller, isPending, key, playbackUrl, state.error, url]);

  const timeLabel = state.error
    ? "Can't play here. Tap to open"
    : isActive && state.duration > 0
      ? `${formatDuration(state.currentTime)} / ${formatDuration(state.duration)}`
      : "Voice message";

  return (
    <Pressable
      style={styles.voiceNoteRow}
      onPress={(event) => {
        event.stopPropagation();
        handlePress();
      }}
      onLongPress={(event) => onLongPress(event.nativeEvent.pageY)}
      delayLongPress={520}
      accessibilityRole="button"
      accessibilityLabel={
        state.error
          ? "Voice message can't play here. Open in browser"
          : state.playing
            ? "Pause voice message"
            : "Play voice message"
      }
      accessibilityValue={isActive && state.duration > 0 ? { text: timeLabel } : undefined}
    >
      <View style={styles.voiceNoteButton}>
        {isActive && state.loading ? (
          <ActivityIndicator size="small" color={tint} />
        ) : (
          <Ionicons
            name={state.error ? "open-outline" : state.playing ? "pause" : "play"}
            size={18}
            color={tint}
          />
        )}
      </View>
      <View style={styles.voiceNoteBody}>
        <View style={styles.voiceNoteTrack}>
          <View
            style={[styles.voiceNoteFill, { width: `${Math.round(progress * 100)}%` }]}
          />
        </View>
        <Text style={styles.voiceNoteTime}>
          {timeLabel}
        </Text>
      </View>
    </Pressable>
  );
}

function FileAttachment({ url, kind, isPending, styles, warm, onLongPress }: AttachmentProps) {
  const name = attachmentFileName(url);
  return (
    <Pressable
      style={styles.fileChip}
      onPress={(event) => {
        event.stopPropagation();
        if (!isPending) openExternally(url);
      }}
      onLongPress={(event) => onLongPress(event.nativeEvent.pageY)}
      delayLongPress={520}
      accessibilityRole="link"
      accessibilityLabel={`${attachmentLabel(kind)} ${name}. Opens externally`}
    >
      <Ionicons
        name={kind === "video" ? "videocam-outline" : "document-attach-outline"}
        size={20}
        color={warm.teal}
      />
      <View style={styles.fileChipTextWrap}>
        <Text numberOfLines={1} style={styles.fileChipName}>
          {name}
        </Text>
        <Text style={styles.fileChipMeta}>
          {attachmentLabel(kind)}
        </Text>
      </View>
      <Ionicons name="open-outline" size={16} color={warm.mutedInk} />
    </Pressable>
  );
}

/** Attachment body of a chat bubble: photo thumbnail, voice-note player or file chip. */
export function MessageAttachment(props: AttachmentProps) {
  switch (props.kind) {
    case "image":
      return <ImageAttachment {...props} />;
    case "audio":
      return <VoiceNoteAttachment {...props} />;
    default:
      return <FileAttachment {...props} />;
  }
}
