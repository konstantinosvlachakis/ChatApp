// Pure helpers for recording voice notes (no React Native imports, so node tests can load them).

/** A recording is sent automatically when it reaches this length. */
export const MAX_VOICE_NOTE_MS = 5 * 60 * 1000;
/** Shorter recordings (an accidental tap) are discarded. */
export const MIN_VOICE_NOTE_MS = 700;

export function isVoiceNoteLongEnough(durationMs: number) {
  return Number.isFinite(durationMs) && durationMs >= MIN_VOICE_NOTE_MS;
}

/** "0:07", "1:05", "5:00". */
export function formatRecordingTime(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor((Number.isFinite(durationMs) ? durationMs : 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function voiceNoteFileName(now: number) {
  return `voice-${now}.m4a`;
}
