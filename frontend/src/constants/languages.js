// Language catalogue shared by the profile editor and sign-up. No asset imports, so the
// prerender script (plain Node) can load pages that use it.

// Short code + endonym for each language the profile editor offers (EditProfilePage LANGUAGE_OPTIONS).
export const LANGUAGE_META = {
  english: { code: "EN", endonym: "English" },
  spanish: { code: "ES", endonym: "Español" },
  french: { code: "FR", endonym: "Français" },
  german: { code: "DE", endonym: "Deutsch" },
  italian: { code: "IT", endonym: "Italiano" },
  portuguese: { code: "PT", endonym: "Português" },
  greek: { code: "GR", endonym: "Ελληνικά" },
  japanese: { code: "JA", endonym: "日本語" },
  korean: { code: "KO", endonym: "한국어" },
  chinese: { code: "ZH", endonym: "中文" },
  arabic: { code: "AR", endonym: "العربية" },
  russian: { code: "RU", endonym: "Русский" },
  turkish: { code: "TR", endonym: "Türkçe" },
  hindi: { code: "HI", endonym: "हिन्दी" },
};

// Same order as the editor's language list.
export const LANGUAGE_KEYS = Object.keys(LANGUAGE_META);

export const LEVELS = ["beginner", "intermediate", "advanced", "fluent"];

export const normalizeLanguage = (language) => String(language || "").trim().toLowerCase();

export const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);

export const describeLanguage = (language) => {
  const key = normalizeLanguage(language);
  const meta = LANGUAGE_META[key];
  const name = titleCase(key);
  return {
    key,
    name,
    code: meta?.code || key.slice(0, 2).toUpperCase(),
    // Only shown when it adds something (not "English (English)").
    endonym: meta && meta.endonym !== name ? meta.endonym : "",
  };
};

// Country for each language's flag (flagcdn.com, allowed by the CSP). Unknown -> no flag.
const FLAG_COUNTRY = {
  english: "gb",
  greek: "gr",
  spanish: "es",
  german: "de",
  french: "fr",
  italian: "it",
  portuguese: "pt",
  russian: "ru",
  turkish: "tr",
  arabic: "sa",
  japanese: "jp",
  korean: "kr",
  chinese: "cn",
  hindi: "in",
};

/** Flag image for a language (`width` px wide: 20, 40, 80, 160…), or null. */
export const flagUrl = (language, width = 40) => {
  const country = FLAG_COUNTRY[normalizeLanguage(language).split(" ")[0]];
  return country ? `https://flagcdn.com/w${width}/${country}.png` : null;
};

// ISO 639-1 code -> app language key, for guessing the native language from the browser.
const LOCALE_LANGUAGE = {
  en: "english",
  es: "spanish",
  fr: "french",
  de: "german",
  it: "italian",
  pt: "portuguese",
  el: "greek",
  ja: "japanese",
  ko: "korean",
  zh: "chinese",
  ar: "arabic",
  ru: "russian",
  tr: "turkish",
  hi: "hindi",
};

/** First of `locales` (e.g. navigator.languages: ["el-GR", "en"]) that the app offers, or "". */
export const languageFromLocales = (locales) => {
  for (const locale of locales || []) {
    const code = String(locale || "").trim().toLowerCase().split(/[-_]/)[0];
    if (LOCALE_LANGUAGE[code]) return LOCALE_LANGUAGE[code];
  }
  return "";
};

/** The browser's preferred language as an app key ("" when unknown or not offered). */
export const browserNativeLanguage = () => {
  if (typeof navigator === "undefined") return "";
  const locales = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languageFromLocales(locales);
};
