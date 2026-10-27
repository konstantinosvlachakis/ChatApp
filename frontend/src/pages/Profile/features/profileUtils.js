import { BASE_URL_IMG } from "../../../constants/constants";
import { DEFAULT_AVATAR_URL } from "../../../constants/avatar";

// Short code + endonym for each language the profile editor offers (EditProfilePage LANGUAGE_OPTIONS).
const LANGUAGE_META = {
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

export const LEVELS = ["beginner", "intermediate", "advanced", "fluent"];

export const normalizeLanguage = (language) => String(language || "").trim().toLowerCase();

const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);

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

// practice_language_levels keys are stored as the client sent them (usually title-cased), so match loosely.
export const levelFor = (levels, language) => {
  const key = normalizeLanguage(language);
  const match = Object.entries(levels || {}).find(([lang]) => normalizeLanguage(lang) === key);
  const level = normalizeLanguage(match?.[1]);
  return LEVELS.includes(level) ? level : "";
};

export const learningLanguages = (profile) =>
  (profile?.languages_practicing || [])
    .map(normalizeLanguage)
    .filter((lang, index, list) => lang && list.indexOf(lang) === index);

export const resolveMediaUrl = (path) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  if (path.startsWith("/media/")) return `${BASE_URL_IMG}${path}`;
  return `${BASE_URL_IMG}/media/${path}`;
};

export const validRingColor = (color) => (/^#[0-9a-fA-F]{6}$/.test(color || "") ? color : "#1b7f79");

// Same rule as People's partner matching: they speak what I learn, and I speak what they learn.
export const exchangeMatch = (me, them) => {
  if (!me || !them) return { teachesMe: false, learnsMine: false, reciprocal: false };
  const teachesMe = learningLanguages(me).includes(normalizeLanguage(them.native_language));
  const learnsMine = learningLanguages(them).includes(normalizeLanguage(me.native_language));
  return { teachesMe, learnsMine, reciprocal: teachesMe && learnsMine };
};

const hasRealPhoto = (path) => Boolean(path) && resolveMediaUrl(path) !== DEFAULT_AVATAR_URL;

// Checklist behind the "Profile strength" card; each step links to where it is fixed.
export const profileStrength = (profile) => {
  const learning = learningLanguages(profile);
  const missingLevels = learning.filter((lang) => !levelFor(profile?.practice_language_levels, lang));
  const extraPhotos = [profile?.complementary_image_1_url, profile?.complementary_image_2_url].filter(hasRealPhoto)
    .length;
  const steps = [
    { key: "photo", done: hasRealPhoto(profile?.profile_image_url), label: "Add a profile photo" },
    {
      key: "photos",
      done: extraPhotos === 2,
      label: extraPhotos === 1 ? "Add 1 more photo" : "Add 2 more photos",
    },
    { key: "bio", done: Boolean(profile?.bio?.trim()), label: "Write a short bio" },
    { key: "goal", done: Boolean(profile?.learning_goal?.trim()), label: "Share your learning goal" },
    { key: "languages", done: learning.length > 0, label: "Add a language you're learning" },
    {
      key: "levels",
      done: learning.length > 0 && missingLevels.length === 0,
      label:
        missingLevels.length === 1
          ? `Set your ${describeLanguage(missingLevels[0]).name} level`
          : "Set your language levels",
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  return { percent: Math.round((doneCount / steps.length) * 100), todo: steps.filter((step) => !step.done) };
};

export const formatViewedAt = (value, now = new Date()) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const minutes = Math.floor((now - date) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};
