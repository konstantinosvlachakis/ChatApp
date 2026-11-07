// Pure helpers for partner corrections and the phrasebook (no RN imports; tested with node).
import type {
  ChatMessage,
  CorrectionPreference,
  MessageCorrection,
  PhrasebookEntry,
  PhrasebookSource,
} from "../types";

export const CORRECTION_NOTE_MAX = 500;
export const CORRECTION_TEXT_MAX = 5000;

export const CORRECTION_PREFERENCE_OPTIONS: Array<{
  value: CorrectionPreference;
  label: string;
  description: string;
}> = [
  {
    value: "often",
    label: "Correct me often",
    description: "Partners can suggest a correction on any of your text messages.",
  },
  {
    value: "when_asked",
    label: "Only when I ask",
    description: "Partners can correct only the messages you flag with “Ask for corrections”.",
  },
  {
    value: "off",
    label: "No corrections",
    description: "Nobody can suggest corrections on your messages.",
  },
];

/** The server default is "often"; older servers omit the field. */
export function correctionPreferenceOf(profile: { correction_preference?: CorrectionPreference | null } | null | undefined) {
  return profile?.correction_preference || "often";
}

function isTextMessage(message: ChatMessage) {
  return (!message.kind || message.kind === "text") && Boolean((message.text || "").trim()) && message.id > 0;
}

/** Someone else's saved text message whose sender accepts corrections. */
export function canSuggestCorrection(message: ChatMessage, currentUserId: number | undefined) {
  if (!currentUserId || message.sender?.id === currentUserId) return false;
  return isTextMessage(message) && Boolean(message.accepts_corrections);
}

/** "Ask for corrections" toggle: own saved text message while my preference is "when_asked". */
export function canRequestCorrections(
  message: ChatMessage,
  currentUserId: number | undefined,
  preference: CorrectionPreference
) {
  if (!currentUserId || message.sender?.id !== currentUserId) return false;
  return preference === "when_asked" && isTextMessage(message);
}

export function findMyCorrection(message: ChatMessage, currentUserId: number | undefined): MessageCorrection | null {
  if (!currentUserId) return null;
  return (message.corrections || []).find((correction) => correction.corrector?.id === currentUserId) || null;
}

const SOURCE_LABELS: Record<PhrasebookSource, string> = {
  manual: "Added by you",
  message: "From a chat",
  translation: "Translation",
  correction: "Correction",
};

export function phraseSourceLabel(source: PhrasebookSource | string | null | undefined) {
  return SOURCE_LABELS[source as PhrasebookSource] || "Saved";
}

/** "spanish" -> "Spanish"; "" -> "". */
export function languageLabel(language: string | null | undefined) {
  const value = String(language || "").trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

export type ReviewPrompt = { kind: "meaning" | "context" | "note" | "recall"; label: string; text: string };

/** Front of a review card: meaning, else context, else note, else a plain recall prompt. */
export function reviewPrompt(entry: Pick<PhrasebookEntry, "meaning" | "context" | "note" | "language">): ReviewPrompt {
  const meaning = (entry.meaning || "").trim();
  if (meaning) return { kind: "meaning", label: "Meaning", text: meaning };
  const context = (entry.context || "").trim();
  if (context) return { kind: "context", label: "Seen in", text: context };
  const note = (entry.note || "").trim();
  if (note) return { kind: "note", label: "Note", text: note };
  const language = languageLabel(entry.language);
  return { kind: "recall", label: language || "Phrase", text: "Recall this phrase" };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Short relative time until `iso`: "now", "in 10 min", "in 3 h", "tomorrow", "in 4 days". */
export function formatRelativeDue(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "";
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return "";
  const delta = at - now;
  if (delta <= MINUTE) return "now";
  if (delta < HOUR) return `in ${Math.round(delta / MINUTE)} min`;
  if (delta < DAY) return `in ${Math.round(delta / HOUR)} h`;
  const days = Math.round(delta / DAY);
  if (days <= 1) return "tomorrow";
  return `in ${days} days`;
}

/** Sheet text for correction error codes (else the server message passed as `fallback`). */
export function correctionErrorText(code: string | undefined, fallback: string) {
  switch (code) {
    case "unchanged_correction":
      return "Change at least one word before saving.";
    case "correction_required":
      return "Write the corrected sentence first.";
    case "correction_too_long":
      return `Keep the correction under ${CORRECTION_TEXT_MAX} characters.`;
    case "note_too_long":
      return `Keep the note under ${CORRECTION_NOTE_MAX} characters.`;
    case "corrections_disabled":
      return "This person has turned corrections off.";
    case "corrections_not_requested":
      return "This person only takes corrections on messages they flag.";
    default:
      return fallback;
  }
}
