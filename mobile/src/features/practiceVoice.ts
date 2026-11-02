// Pure helpers for Practice (mirror web `frontend/src/pages/Practice/practiceUtils.js`).

const SPEECH_MATCH_THRESHOLD = 0.72;

/** Shown on the first drill challenge of a new round (backend `round_complete`). */
export const ROUND_COMPLETE_MESSAGE =
  "You've practised every sentence for this level, so we're starting a fresh round.";

/** Word key for comparison: lowercase, no punctuation, no diacritics ("Él," -> "el"). */
export const speechWordKey = (word: string) =>
  String(word || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Explicit punctuation list (no \p{} escapes: not every JS engine supports them).
    .replace(/[\s.,!?;:()'"`«»„“”‘’¿¡…—–\-[\]{}/\··;]+/g, "");

const speechKeys = (value: string) =>
  String(value || "")
    .split(/\s+/)
    .map(speechWordKey)
    .filter(Boolean);

/** Share of target words heard (bag of words; case, punctuation and diacritic-insensitive). */
export const calculateSpeechMatch = (target: string, actual: string) => {
  const t = speechKeys(target);
  const a = speechKeys(actual);
  if (!t.length || !a.length) return 0;
  const targetCounts: Record<string, number> = {};
  const actualCounts: Record<string, number> = {};
  t.forEach((word) => {
    targetCounts[word] = (targetCounts[word] || 0) + 1;
  });
  a.forEach((word) => {
    actualCounts[word] = (actualCounts[word] || 0) + 1;
  });
  let overlap = 0;
  Object.keys(targetCounts).forEach((word) => {
    overlap += Math.min(targetCounts[word], actualCounts[word] || 0);
  });
  return overlap / Math.max(t.length, 1);
};

export const requiredSpeechMatchThreshold = (sentence: string) => {
  const wordCount = speechKeys(sentence).length;
  if (wordCount <= 4) return 0.62;
  if (wordCount <= 7) return 0.68;
  return SPEECH_MATCH_THRESHOLD;
};

export type SpeechWordMark = { word: string; matched: boolean };

/**
 * Mark each target word as matched/missed: words are aligned in order (longest common
 * subsequence), ignoring case, punctuation and diacritics. Keeps the target's spelling.
 */
export const markSpeechWords = (target: string, transcript: string): SpeechWordMark[] => {
  const words = String(target || "").split(/\s+/).filter(Boolean);
  const targetKeys = words.map(speechWordKey);
  const heardKeys = speechKeys(transcript);
  const rows = targetKeys.length;
  const cols = heardKeys.length;
  const table = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i][j] =
        targetKeys[i] && targetKeys[i] === heardKeys[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const matched = new Array<boolean>(rows).fill(false);
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (targetKeys[i] && targetKeys[i] === heardKeys[j]) {
      matched[i] = true;
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return words.map((word, index) => ({ word, matched: matched[index] || !targetKeys[index] }));
};

export type VoiceAttempt = { score: number; passed: boolean; words: SpeechWordMark[] };

export const evaluateVoiceAttempt = (sentence: string, transcript: string): VoiceAttempt => {
  const score = calculateSpeechMatch(sentence, transcript);
  return {
    score,
    passed: score >= requiredSpeechMatchThreshold(sentence),
    words: markSpeechWords(sentence, transcript),
  };
};
