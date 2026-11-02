import api, { isApiError } from "../../lib/api";

export const DAILY_SET_STEPS = 10;
export const XP_PER_LEVEL = 100;
const SPEECH_MATCH_THRESHOLD = 0.72;

export const levelProgressPercent = (xp) => Math.min(100, Math.max(0, (xp || 0) % XP_PER_LEVEL));

/** "english" -> "English" for display; option values stay lowercase. */
export const formatLanguageName = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  return text
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

/** Practice languages for the picker (lowercase, deduplicated, never empty). */
export const buildLanguageOptions = (user) => {
  const set = new Set();
  (user?.languages_practicing || []).forEach((lang) => {
    if (lang && String(lang).trim()) set.add(String(lang).trim().toLowerCase());
  });
  if (user?.base_translate_language) set.add(String(user.base_translate_language).trim().toLowerCase());
  if (user?.native_language) set.add(String(user.native_language).trim().toLowerCase());
  if (!set.size) set.add("english");
  return [...set];
};

export const getChallengeSourceLabel = (source) => {
  if (source === "generator_daily") return "Today's AI set";
  if (source === "generator") return "AI generated";
  return "Core library";
};

/** Target languages for translating practice text: base, native, then English, minus the source. */
export const translationTargets = (user, sourceLanguage) => {
  const base = (user?.base_translate_language || "").trim().toLowerCase();
  const native = (user?.native_language || "").trim().toLowerCase();
  const source = (sourceLanguage || "").trim().toLowerCase();
  return [base, native, "english"].filter(
    (item, index, arr) => item && arr.indexOf(item) === index && item !== source
  );
};

/**
 * Translate free text via POST /api/messages/translate/, trying each target in turn.
 * same_language (400) and other API errors move on to the next target; network errors throw.
 * Resolves `{ text, target }` (empty strings when nothing translated).
 */
export const translateWithFallback = async (text, targets) => {
  for (const targetLanguage of targets) {
    let payload;
    try {
      payload = await api.post("/api/messages/translate/", { text, target_language: targetLanguage });
    } catch (error) {
      if (isApiError(error) && error.code !== "network_error") continue;
      throw error;
    }
    const translated = payload?.translated_text || "";
    if (translated) return { text: translated, target: targetLanguage };
  }
  return { text: "", target: "" };
};

/* ---------- Voice repeat helpers (logic unchanged from the old PracticePage) ---------- */

export const LANGUAGE_SPEECH_CODE = {
  english: "en-US",
  spanish: "es-ES",
  french: "fr-FR",
  greek: "el-GR",
  russian: "ru-RU",
};

/** Next Voice Repeat sentence: `{ id, text, language, bucket, round_complete, pass_threshold, translation_hint? }`. */
export const fetchVoiceSentence = (language) =>
  api.get("/api/practice/voice/next/", { params: language ? { language } : undefined });

/**
 * Claim XP for a passed sentence (`score` 0-1). The server only pays served ids, once per
 * sentence per day, up to the daily voice/XP caps; the response carries the updated stats.
 */
export const completeVoiceSentence = (id, score) => api.post("/api/practice/voice/complete/", { id, score });

/** Result-card label for a voice XP claim (`reward` from VoiceRepeat). */
export const voiceRewardLabel = (reward) => {
  if (!reward) return "";
  if (reward.status === "pending") return "Saving XP...";
  if (reward.awardedXp > 0) return `+${reward.awardedXp} XP`;
  if (reward.alreadyScored) return "Already earned today";
  if (reward.voiceLimit) return "Daily voice XP reached";
  if (reward.xpLimit) return "Daily XP limit reached";
  return "XP couldn't be saved this time";
};

export const VOICE_ROUND_COMPLETE_MESSAGE =
  "You've practised every voice sentence for this level, so we're starting a fresh round.";

export const pickBestVoiceForLanguage = (language) => {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;

  const targetLang = (LANGUAGE_SPEECH_CODE[language] || "en-US").toLowerCase();
  const baseLang = targetLang.split("-")[0];

  const languageMatches = voices.filter((voice) => {
    const voiceLang = (voice.lang || "").toLowerCase();
    return voiceLang === targetLang || voiceLang.startsWith(`${baseLang}-`) || voiceLang === baseLang;
  });
  const candidates = languageMatches.length ? languageMatches : voices;

  // Prefer native/local and higher-quality engine labels when available.
  const scoreVoice = (voice) => {
    const name = `${voice.name || ""} ${voice.voiceURI || ""}`.toLowerCase();
    const lang = (voice.lang || "").toLowerCase();
    let score = 0;
    if (lang === targetLang) score += 60;
    else if (lang.startsWith(`${baseLang}-`) || lang === baseLang) score += 40;
    if (voice.localService) score += 20;
    if (voice.default) score += 10;
    if (name.includes("neural")) score += 16;
    if (name.includes("premium")) score += 14;
    if (name.includes("natural")) score += 12;
    if (name.includes("enhanced")) score += 10;
    if (name.includes("google")) score += 8;
    if (name.includes("microsoft")) score += 7;
    if (name.includes("apple")) score += 6;
    return score;
  };

  const sorted = [...candidates].sort((a, b) => scoreVoice(b) - scoreVoice(a));
  return sorted[0] || null;
};

// Case, punctuation and diacritic-insensitive (recognisers differ on accents, ё/е and tonos).
const normalizeSpeechText = (value) =>
  String(value || "")
    .split(/\s+/)
    .map((word) => speechWordKey(word))
    .filter(Boolean)
    .join(" ");

export const calculateSpeechMatch = (target, actual) => {
  const t = normalizeSpeechText(target).split(" ").filter(Boolean);
  const a = normalizeSpeechText(actual).split(" ").filter(Boolean);
  if (!t.length || !a.length) return 0;
  const targetCounts = {};
  const actualCounts = {};
  t.forEach((w) => {
    targetCounts[w] = (targetCounts[w] || 0) + 1;
  });
  a.forEach((w) => {
    actualCounts[w] = (actualCounts[w] || 0) + 1;
  });
  let overlap = 0;
  Object.keys(targetCounts).forEach((w) => {
    overlap += Math.min(targetCounts[w], actualCounts[w] || 0);
  });
  return overlap / Math.max(t.length, 1);
};

export const requiredSpeechMatchThreshold = (sentence) => {
  const wordCount = normalizeSpeechText(sentence).split(" ").filter(Boolean).length;
  if (wordCount <= 4) return 0.62;
  if (wordCount <= 7) return 0.68;
  return SPEECH_MATCH_THRESHOLD;
};

/** Shown on the first challenge of a new round (backend `round_complete`). */
export const ROUND_COMPLETE_MESSAGE =
  "You've practised every sentence for this level, so we're starting a fresh round.";

/** Word key for alignment: lowercase, no punctuation, no diacritics ("Él," -> "el"). */
export const speechWordKey = (word) =>
  String(word || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Explicit punctuation list (no \p{} escapes: not every JS engine supports them).
    .replace(/[\s.,!?;:()'"`«»„“”‘’¿¡…—–\-[\]{}/\··;]+/g, "");

/**
 * Mark each word of the target sentence as matched/missed against what was heard. Words are
 * aligned in order (longest common subsequence), ignoring case, punctuation and diacritics.
 * Returns [{ word, matched }] with the target's original spelling.
 */
export const markSpeechWords = (target, transcript) => {
  const words = String(target || "").split(/\s+/).filter(Boolean);
  const targetKeys = words.map(speechWordKey);
  const heardKeys = String(transcript || "")
    .split(/\s+/)
    .map(speechWordKey)
    .filter(Boolean);
  const rows = targetKeys.length;
  const cols = heardKeys.length;
  const table = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i][j] =
        targetKeys[i] && targetKeys[i] === heardKeys[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const matched = new Array(rows).fill(false);
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
  // A "word" that is only punctuation (e.g. "—") is never counted as missed.
  return words.map((word, index) => ({ word, matched: matched[index] || !targetKeys[index] }));
};

/** "Spanish · Everyday grammar" for the per-language difficulty (server `progress`). */
export const progressTitle = (progress, language) => {
  const name = formatLanguageName(progress?.language || language);
  const label = progress?.bucket_label || "";
  return [name, label].filter(Boolean).join(" · ");
};

/**
 * One-line summary of the per-language level-up progress, e.g.
 * "12/15 sentences · 85% accuracy · 3 more to level up".
 * Rules come from the server: `needed_for_promotion` {attempts_remaining, min_attempts, accuracy_target}.
 */
export const progressSummary = (progress) => {
  if (!progress) return "";
  const accuracy = typeof progress.window_accuracy === "number" ? Math.round(progress.window_accuracy * 100) : null;
  const accuracyText = accuracy === null ? null : `${accuracy}% accuracy`;
  const needed = progress.needed_for_promotion;
  if (!progress.can_promote || !needed) {
    return ["Top level", accuracyText].filter(Boolean).join(" · ");
  }
  const minAttempts = needed.min_attempts || 0;
  const attempts = Math.min(progress.attempts_in_bucket || 0, minAttempts);
  const target = Math.round((needed.accuracy_target || 0) * 100);
  const remaining = needed.attempts_remaining || 0;
  const belowTarget = accuracy !== null && accuracy < target;
  let next;
  if (remaining > 0) {
    next = belowTarget
      ? `${remaining} more at ≥ ${target}% accuracy to level up`
      : `${remaining} more to level up`;
  } else {
    next = `Keep accuracy ≥ ${target}% to level up`;
  }
  return [`${attempts}/${minAttempts} sentences`, accuracyText, next].filter(Boolean).join(" · ");
};

/** Banner copy for a level change reported on a submit (`progress.change`). */
export const levelChangeMessage = (progress) => {
  if (!progress?.change) return null;
  const name = formatLanguageName(progress.language);
  if (progress.change === "promoted") {
    return { tone: "good", title: "Level up!", text: `${name} → ${progress.bucket_label}` };
  }
  if (progress.change === "demoted") {
    return { tone: "calm", title: "Let's build a stronger base", text: `Let's practise ${progress.bucket_label} a bit more.` };
  }
  return null;
};
