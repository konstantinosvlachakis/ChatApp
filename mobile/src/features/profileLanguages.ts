// Profile editing uses the full supported catalogue, independently of Lumi's
// suggested languages. Values match the backend's language and level keys.
export type ProfileLanguageOption = { value: string; label: string; code: string; nativeLabel: string };

export const PROFILE_LANGUAGES: readonly ProfileLanguageOption[] = [
  { value: "arabic", label: "Arabic", code: "AR", nativeLabel: "العربية" },
  { value: "chinese", label: "Chinese", code: "ZH", nativeLabel: "中文 · Mandarin" },
  { value: "english", label: "English", code: "EN", nativeLabel: "English" },
  { value: "french", label: "French", code: "FR", nativeLabel: "Français" },
  { value: "german", label: "German", code: "DE", nativeLabel: "Deutsch" },
  { value: "greek", label: "Greek", code: "EL", nativeLabel: "Ελληνικά" },
  { value: "hindi", label: "Hindi", code: "HI", nativeLabel: "हिन्दी" },
  { value: "italian", label: "Italian", code: "IT", nativeLabel: "Italiano" },
  { value: "japanese", label: "Japanese", code: "JA", nativeLabel: "日本語" },
  { value: "korean", label: "Korean", code: "KO", nativeLabel: "한국어" },
  { value: "portuguese", label: "Portuguese", code: "PT", nativeLabel: "Português" },
  { value: "russian", label: "Russian", code: "RU", nativeLabel: "Русский" },
  { value: "spanish", label: "Spanish", code: "ES", nativeLabel: "Español" },
  { value: "turkish", label: "Turkish", code: "TR", nativeLabel: "Türkçe" },
];

export function getProfileLanguageOptions(user?: {
  native_language?: string; base_translate_language?: string; languages_practicing?: string[];
} | null): ProfileLanguageOption[] {
  const options = new Map(PROFILE_LANGUAGES.map((option) => [option.value, option]));
  // Retain legacy/custom selections rather than silently dropping saved values.
  for (const raw of [user?.native_language, user?.base_translate_language, ...(user?.languages_practicing || [])]) {
    const value = String(raw || "").trim().toLowerCase();
    if (!value || options.has(value)) continue;
    options.set(value, { value, label: value.charAt(0).toUpperCase() + value.slice(1), code: value.slice(0, 2).toUpperCase(), nativeLabel: "" });
  }
  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label, "en"));
}

const searchable = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function filterProfileLanguages(options: readonly ProfileLanguageOption[], query: string) {
  const needle = searchable(query.trim());
  return options.filter((option) => searchable(`${option.label} ${option.value} ${option.nativeLabel} ${option.code}`).includes(needle));
}
