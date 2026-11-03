// The viewer's side of an exchange, with the same rules the server uses for
// matching (backend `partner_language_sets`): you *speak* your native language
// and any language you practise at Advanced or Fluent; every other practised
// language is one you're still learning.

export type SpokenLevel = "native" | "advanced" | "fluent";

export interface ExchangeLanguage {
  language: string;
  level: string;
}

export interface ViewerExchangeLanguages {
  spoken: Array<{ language: string; level: SpokenLevel }>;
  /** Practised languages below Advanced (or without a level). */
  practising: ExchangeLanguage[];
}

const SPOKEN_LEVELS = new Set(["advanced", "fluent"]);

const levelFor = (levels: Record<string, string>, language: string) => {
  const key = Object.keys(levels || {}).find((entry) => entry.trim().toLowerCase() === language.trim().toLowerCase());
  return key ? String(levels[key] || "").trim().toLowerCase() : "";
};

export function viewerExchangeLanguages(user?: {
  native_language?: string;
  languages_practicing?: string[];
  practice_language_levels?: Record<string, string>;
} | null): ViewerExchangeLanguages {
  const seen = new Set<string>();
  const spoken: ViewerExchangeLanguages["spoken"] = [];
  const practising: ExchangeLanguage[] = [];
  const native = (user?.native_language || "").trim();
  if (native) {
    spoken.push({ language: native, level: "native" });
    seen.add(native.toLowerCase());
  }
  for (const raw of user?.languages_practicing || []) {
    const language = String(raw || "").trim();
    const key = language.toLowerCase();
    if (!language || seen.has(key)) continue;
    seen.add(key);
    const level = levelFor(user?.practice_language_levels || {}, language);
    if (SPOKEN_LEVELS.has(level)) spoken.push({ language, level: level as SpokenLevel });
    else practising.push({ language, level });
  }
  return { spoken, practising };
}

/** "your native language" / "which you speak fluently" / "which you speak at an advanced level". */
export function youSpeakPhrase(level?: string) {
  if (level === "native") return "your native language";
  if (level === "fluent") return "which you speak fluently";
  if (level === "advanced") return "which you speak at an advanced level";
  return "";
}
