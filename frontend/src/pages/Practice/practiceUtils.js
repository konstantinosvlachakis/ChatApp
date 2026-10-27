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

export const VOICE_SENTENCE_LIBRARY = {
  english: [
    "I practice English every day.",
    "The weather is beautiful today.",
    "Please repeat this sentence clearly.",
  ],
  spanish: [
    "Practico espanol todos los dias.",
    "Hoy hace muy buen tiempo.",
    "Por favor repite esta frase claramente.",
  ],
  french: [
    "Je pratique le francais chaque jour.",
    "Il fait tres beau aujourd hui.",
    "Repete cette phrase avec une bonne prononciation.",
  ],
  greek: [
    "Εξασκούμαι στα ελληνικά κάθε μέρα.",
    "Σήμερα ο καιρός είναι υπέροχος.",
    "Παρακαλώ επανάλαβε αυτή την πρόταση καθαρά.",
  ],
  russian: [
    "Я практикую русский язык каждый день.",
    "Сегодня очень хорошая погода.",
    "Пожалуйста повтори это предложение четко.",
  ],
};

export const randomVoiceSentence = (language) => {
  const pool = VOICE_SENTENCE_LIBRARY[language] || VOICE_SENTENCE_LIBRARY.english;
  return pool[Math.floor(Math.random() * pool.length)];
};

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

const normalizeSpeechText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[.,!?;:()'"`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

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
