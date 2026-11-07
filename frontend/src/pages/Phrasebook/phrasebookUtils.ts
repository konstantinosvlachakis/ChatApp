import type { PhraseSource, PhrasebookEntry } from "./api/phrasebook";

export const BLANK = "_____";

export const SOURCE_LABELS: Record<PhraseSource, string> = {
  manual: "Added by you",
  message: "From chat",
  translation: "Translation",
  correction: "Correction",
};

export const sourceLabel = (source: string) => SOURCE_LABELS[source as PhraseSource] || "Saved";

/** "spanish" → "Spanish"; "" → "". */
export const languageLabel = (language: string | null | undefined) => {
  const value = String(language || "").trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replace the phrase inside its context with a blank (case-insensitive); null when absent. */
export const blankPhrase = (context: string, phrase: string): string | null => {
  const source = String(context || "");
  const target = String(phrase || "").trim();
  if (!source || !target) return null;
  const pattern = new RegExp(escapeRegExp(target), "gi");
  if (!pattern.test(source)) return null;
  return source.replace(pattern, BLANK);
};

export type ReviewPrompt = { kind: "meaning" | "context" | "note" | "recall"; text: string };

/** Front of a review card: meaning, else the context with the phrase blanked, else the note. */
export const reviewPrompt = (entry: Pick<PhrasebookEntry, "text" | "meaning" | "context" | "note">): ReviewPrompt => {
  const meaning = String(entry.meaning || "").trim();
  if (meaning) return { kind: "meaning", text: meaning };
  const blanked = blankPhrase(entry.context, entry.text);
  if (blanked) return { kind: "context", text: blanked };
  const note = String(entry.note || "").trim();
  if (note) return { kind: "note", text: note };
  return { kind: "recall", text: "Recall this phrase" };
};

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

/** "in 3 hours", "tomorrow", "in 2 weeks"; "now" within a minute; "" for an invalid date. */
export const formatRelativeTime = (value: string | null | undefined, now: number = Date.now()) => {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  const diff = time - now;
  if (Math.abs(diff) < 60 * 1000) return "now";
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(diff) >= size || unit === "minute") {
      return formatter.format(Math.round(diff / size), unit);
    }
  }
  return "";
};

export const REVIEW_RESULTS = [
  { result: "again", label: "Again", hint: "Didn't know it", key: "1" },
  { result: "hard", label: "Hard", hint: "Got it with effort", key: "2" },
  { result: "good", label: "Good", hint: "Knew it", key: "3" },
  { result: "easy", label: "Easy", hint: "Too easy", key: "4" },
] as const;
