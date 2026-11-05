import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { hapticLight } from "../../services/haptics";
import { showToast } from "../../services/toast";
import type { WarmColors } from "../../theme/warm";
import type { PickedAttachment } from "./attachments";
import { ChatAudioContext } from "./audioController";
import { SEND_BUTTON_SIZE } from "./SendButton";
import { formatRecordingTime, isVoiceNoteLongEnough, MAX_VOICE_NOTE_MS, voiceNoteFileName } from "./voiceNote";

/**
 * Voice-note recording for the chat composer: tap the mic to start, then send or discard.
 * Records AAC in an .m4a container (`audio/mp4`), which the backend accepts and both apps play.
 */
export function useVoiceNoteRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const status = useAudioRecorderState(recorder, 250);
  const audio = useContext(ChatAudioContext);
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(false);
  const startingRef = useRef(false);

  const resetAudioMode = useCallback(() => {
    // Back to playback: on iOS a recording session routes sound to the earpiece.
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  }, []);

  const start = useCallback(async () => {
    if (recordingRef.current || startingRef.current) return;
    startingRef.current = true;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        showToast("Allow microphone access in Settings to record voice messages.", {
          title: "Microphone is off",
          variant: "error",
        });
        return;
      }
      audio?.release(); // Stop a voice note that is playing.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      setRecording(true);
      hapticLight();
    } catch {
      resetAudioMode();
      showToast("Could not start recording.", { variant: "error" });
    } finally {
      startingRef.current = false;
    }
  }, [audio, recorder, resetAudioMode]);

  /** Stops recording; returns the file to send, or null if discarded or too short. */
  const stop = useCallback(
    async (keep: boolean): Promise<PickedAttachment | null> => {
      if (!recordingRef.current) return null;
      recordingRef.current = false;
      setRecording(false);
      const durationMs = recorder.getStatus().durationMillis;
      try {
        await recorder.stop();
      } catch {
        // Already stopped (e.g. interrupted by a call): use whatever was written.
      }
      resetAudioMode();
      const uri = recorder.uri;
      if (!keep || !uri) return null;
      if (!isVoiceNoteLongEnough(durationMs)) {
        showToast("Hold on a little longer to record a voice message.", { variant: "info" });
        return null;
      }
      return { uri, name: voiceNoteFileName(Date.now()), mimeType: "audio/mp4", fileSize: null };
    },
    [recorder, resetAudioMode]
  );

  // Leaving the app or the chat discards an unfinished recording.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active" && recordingRef.current) void stop(false);
    });
    return () => {
      subscription.remove();
      if (recordingRef.current) {
        recordingRef.current = false;
        recorder.stop().catch(() => {});
        resetAudioMode();
      }
    };
  }, [recorder, resetAudioMode, stop]);

  return { recording, durationMs: status.durationMillis || 0, start, stop };
}

type RecordingBarProps = {
  warm: WarmColors;
  durationMs: number;
  onDiscard: () => void;
  onSend: () => void;
};

/** Replaces the composer row while recording: discard, live timer, send. */
export function RecordingBar({ warm, durationMs, onDiscard, onSend }: RecordingBarProps) {
  const nearLimit = durationMs >= MAX_VOICE_NOTE_MS - 15_000;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onDiscard}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Discard voice message"
      >
        <Ionicons name="trash-outline" size={22} color={warm.danger} />
      </Pressable>
      <View
        style={[styles.pill, { backgroundColor: warm.paper, borderColor: warm.line }]}
        accessibilityRole="timer"
        accessibilityLabel={`Recording, ${formatRecordingTime(durationMs)}`}
        accessibilityLiveRegion="polite"
      >
        <View style={[styles.dot, { backgroundColor: warm.danger }]} />
        <Text style={[styles.time, { color: warm.ink }]}>{formatRecordingTime(durationMs)}</Text>
        <Text style={[styles.label, { color: nearLimit ? warm.danger : warm.mutedInk }]} numberOfLines={1}>
          {nearLimit ? "Sends automatically at 5:00" : "Recording…"}
        </Text>
      </View>
      <Pressable
        onPress={onSend}
        style={({ pressed }) => [styles.send, { backgroundColor: warm.navy }, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Send voice message"
      >
        <Ionicons name="arrow-up" size={22} color={warm.onNavy} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconButton: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  pill: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 8,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  time: { fontSize: 16, fontVariant: ["tabular-nums"], fontWeight: "600" },
  label: { flex: 1, fontSize: 14 },
  send: {
    width: SEND_BUTTON_SIZE,
    height: SEND_BUTTON_SIZE,
    borderRadius: SEND_BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.85 },
});
