import assert from "node:assert/strict";
import test from "node:test";
import { getAttachmentKind } from "../src/components/chat/attachments.ts";
import { confirmPendingMessage } from "../src/components/chat/messageState.ts";
import {
  formatRecordingTime,
  isVoiceNoteLongEnough,
  MAX_VOICE_NOTE_MS,
  voiceNoteFileName,
} from "../src/components/chat/voiceNote.ts";

test("recording time reads m:ss", () => {
  assert.equal(formatRecordingTime(0), "0:00");
  assert.equal(formatRecordingTime(7_900), "0:07");
  assert.equal(formatRecordingTime(65_000), "1:05");
  assert.equal(formatRecordingTime(MAX_VOICE_NOTE_MS), "5:00");
  assert.equal(formatRecordingTime(Number.NaN), "0:00");
});

test("accidental taps are too short to send", () => {
  assert.equal(isVoiceNoteLongEnough(300), false);
  assert.equal(isVoiceNoteLongEnough(700), true);
  assert.equal(isVoiceNoteLongEnough(Number.NaN), false);
});

test("a recording is an m4a voice note before and after upload", () => {
  assert.equal(voiceNoteFileName(123), "voice-123.m4a");
  // Optimistic bubble: local file + content type.
  assert.equal(getAttachmentKind("file:///cache/voice-123.m4a", "audio/mp4"), "audio");
  // Saved copy: uploaded URL.
  assert.equal(getAttachmentKind("https://res.cloudinary.com/x/raw/upload/v1/media/voice-123.m4a"), "audio");
});

test("the saved voice note fills its sending bubble", () => {
  const me = { id: 1 };
  const list = [
    { id: -3, local_key: "-3", sender: me, text: "", local_status: "sending", attachment_url: "file:///v.m4a" },
  ];
  const next = confirmPendingMessage(list, { id: 9, sender: me, text: "", attachment_url: "https://x.test/v.m4a" });
  assert.equal(next[0].id, 9);
  assert.equal(next[0].attachment_url, "https://x.test/v.m4a");
  assert.equal(next[0].local_key, "-3");
});
