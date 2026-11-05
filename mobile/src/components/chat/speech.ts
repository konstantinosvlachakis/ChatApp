// Voice language for "Speak" in the message menu (pure; the screen calls expo-speech with it).
// Like web Conversation.jsx `resolveSpeechLanguage`: the writing system decides when it is
// unambiguous, then the given hints (detected translation source, sender's native language).

const SPEECH_CODES: Record<string, string> = {
  arabic: "ar-SA",
  chinese: "zh-CN",
  english: "en-US",
  french: "fr-FR",
  german: "de-DE",
  greek: "el-GR",
  hindi: "hi-IN",
  italian: "it-IT",
  japanese: "ja-JP",
  korean: "ko-KR",
  portuguese: "pt-PT",
  russian: "ru-RU",
  spanish: "es-ES",
  turkish: "tr-TR",
};

const CODE_TO_NAME: Record<string, string> = {
  ar: "arabic",
  zh: "chinese",
  en: "english",
  fr: "french",
  de: "german",
  el: "greek",
  hi: "hindi",
  it: "italian",
  ja: "japanese",
  ko: "korean",
  pt: "portuguese",
  ru: "russian",
  es: "spanish",
  tr: "turkish",
};

// Scripts that name one language well enough (in this app's catalogue).
const SCRIPT_LANGUAGES: Array<[RegExp, string]> = [
  [/[Ͱ-Ͽἀ-῿]/, "greek"],
  [/[Ѐ-ӿ]/, "russian"],
  [/[؀-ۿ]/, "arabic"],
  [/[ऀ-ॿ]/, "hindi"],
  [/[가-힯ᄀ-ᇿ]/, "korean"],
  [/[぀-ヿ]/, "japanese"],
  [/[一-鿿]/, "chinese"],
];

/** "es", "es-MX", "Spanish" → "es-ES"; unknown → null. */
export function speechCodeFor(language?: string | null) {
  const value = String(language || "").trim().toLowerCase();
  if (!value || value === "auto") return null;
  const name = SPEECH_CODES[value] ? value : CODE_TO_NAME[value.split(/[-_]/)[0]];
  return name ? SPEECH_CODES[name] : null;
}

/**
 * The BCP-47 code to speak `text` with, or undefined to let the device use its default voice.
 * `hints` are tried in order (e.g. the detected source language of a translation, then the
 * sender's native language).
 */
export function resolveSpeechLanguage(text: string, hints: Array<string | null | undefined> = []) {
  for (const [pattern, name] of SCRIPT_LANGUAGES) {
    if (pattern.test(text)) return SPEECH_CODES[name];
  }
  for (const hint of hints) {
    const code = speechCodeFor(hint);
    if (code) return code;
  }
  return undefined;
}
