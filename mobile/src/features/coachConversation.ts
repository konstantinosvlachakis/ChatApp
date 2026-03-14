import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ChatMessage, Profile } from "../types";

export const COACH_BOT_ID = -999;

export const COACH_MODES = [
  {
    id: "casual_chat",
    label: "Casual Chat",
    shortLabel: "Chat",
    description: "Natural back-and-forth conversation with light corrections.",
  },
  {
    id: "correct_me",
    label: "Correct Me",
    shortLabel: "Correct",
    description: "Answer naturally, then rewrite mistakes clearly.",
  },
  {
    id: "roleplay",
    label: "Roleplay",
    shortLabel: "Roleplay",
    description: "Act out real situations like cafes, travel, or work.",
  },
  {
    id: "quiz_me",
    label: "Quiz Me",
    shortLabel: "Quiz",
    description: "Ask short questions one at a time.",
  },
  {
    id: "vocabulary_drill",
    label: "Vocabulary Drill",
    shortLabel: "Vocab",
    description: "Focus on useful words, phrases, and recall.",
  },
] as const;

export const COACH_QUICK_PROMPTS = [
  "Correct my last sentence and explain why.",
  "Let's roleplay ordering at a cafe.",
  "Quiz me with five short questions.",
  "Give me useful travel phrases.",
];

const LANGUAGE_LABELS: Record<string, string> = {
  english: "English",
  french: "French",
  greek: "Greek",
  spanish: "Spanish",
  italian: "Italian",
  german: "German",
  portuguese: "Portuguese",
  dutch: "Dutch",
  turkish: "Turkish",
  japanese: "Japanese",
  korean: "Korean",
  chinese: "Chinese",
  russian: "Russian",
  arabic: "Arabic",
};

const getMessagesStorageKey = (userId?: number) => `coach:messages:${userId || "guest"}`;
const getPreferencesStorageKey = (userId?: number) => `coach:preferences:${userId || "guest"}`;

export type CoachModeId = (typeof COACH_MODES)[number]["id"];

export type CoachPreferences = {
  language: string;
  mode: CoachModeId;
};

const normalizeLanguage = (value: unknown) => String(value || "").trim().toLowerCase();

const toLanguageOption = (value: unknown) => {
  const normalized = normalizeLanguage(value);
  if (!normalized) return null;
  return {
    value: normalized,
    label:
      LANGUAGE_LABELS[normalized] || normalized.charAt(0).toUpperCase() + normalized.slice(1),
  };
};

export const getCoachLanguageOptions = (user?: Profile | null) => {
  const candidateValues = [
    user?.base_translate_language,
    ...(Array.isArray(user?.languages_practicing) ? user.languages_practicing : []),
    user?.native_language,
    "english",
    "french",
    "greek",
    "spanish",
  ];

  const seen = new Set<string>();
  return candidateValues
    .map(toLanguageOption)
    .filter((option): option is { value: string; label: string } => {
      if (!option || seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
};

export const getDefaultCoachLanguage = (user?: Profile | null) =>
  getCoachLanguageOptions(user)[0]?.value || "english";

export const getDefaultCoachPreferences = (user?: Profile | null): CoachPreferences => ({
  language: getDefaultCoachLanguage(user),
  mode: COACH_MODES[0].id,
});

export const getCoachAvatarUri = (language?: string | null) => {
  const accent = encodeURIComponent(language || "language");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#334155" />
          <stop offset="50%" stop-color="#0f766e" />
          <stop offset="100%" stop-color="#f8b4d9" />
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="40" fill="url(#bg)"/>
      <circle cx="80" cy="80" r="52" fill="rgba(255,255,255,0.08)"/>
      <text x="80" y="76" text-anchor="middle" font-family="Georgia, serif" font-size="36" fill="#ffffff">L</text>
      <text x="80" y="103" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" letter-spacing="3" fill="#e0f2fe">LUMI</text>
      <text x="80" y="132" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#fce7f3">${accent}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const createBotProfile = () => ({
  id: COACH_BOT_ID,
  username: "Lumi",
});

const createInitialMessages = (user?: Profile | null, preferences?: CoachPreferences): ChatMessage[] => {
  const resolvedPreferences = preferences || getDefaultCoachPreferences(user);
  const languageLabel =
    getCoachLanguageOptions(user).find((option) => option.value === resolvedPreferences.language)?.label ||
    resolvedPreferences.language;
  const mode = COACH_MODES.find((entry) => entry.id === resolvedPreferences.mode) || COACH_MODES[0];

  return [
    {
      id: Date.now(),
      text: `Hi ${user?.username || "there"} - I'm Lumi, your ${languageLabel} practice companion. We are in ${mode.label.toLowerCase()} mode. Ask for corrections, roleplay, quizzes, or vocab drills whenever you want.`,
      sender: createBotProfile(),
      timestamp: new Date().toISOString(),
      can_translate: false,
      reactions: [],
      current_user_reaction: null,
    },
  ];
};

export async function readCoachPreferences(user?: Profile | null): Promise<CoachPreferences> {
  const defaults = getDefaultCoachPreferences(user);
  const raw = await AsyncStorage.getItem(getPreferencesStorageKey(user?.user_id));
  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw);
    const availableLanguages = new Set(getCoachLanguageOptions(user).map((option) => option.value));
    const availableModes = new Set(COACH_MODES.map((mode) => mode.id));
    return {
      language: availableLanguages.has(parsed?.language) ? parsed.language : defaults.language,
      mode: availableModes.has(parsed?.mode) ? parsed.mode : defaults.mode,
    };
  } catch {
    return defaults;
  }
}

export async function persistCoachPreferences(
  user: Profile | null | undefined,
  preferences: CoachPreferences
) {
  await AsyncStorage.setItem(
    getPreferencesStorageKey(user?.user_id),
    JSON.stringify(preferences)
  );
}

export async function readCoachMessages(
  user?: Profile | null,
  preferences?: CoachPreferences
): Promise<ChatMessage[]> {
  const resolvedPreferences = preferences || (await readCoachPreferences(user));
  const raw = await AsyncStorage.getItem(getMessagesStorageKey(user?.user_id));
  if (!raw) return createInitialMessages(user, resolvedPreferences);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return createInitialMessages(user, resolvedPreferences);
    }
    return parsed;
  } catch {
    return createInitialMessages(user, resolvedPreferences);
  }
}

export async function persistCoachMessages(user: Profile | null | undefined, messages: ChatMessage[]) {
  await AsyncStorage.setItem(getMessagesStorageKey(user?.user_id), JSON.stringify(messages));
}

export async function resetCoachConversation(
  user?: Profile | null,
  preferences?: CoachPreferences
) {
  const nextMessages = createInitialMessages(user, preferences);
  await persistCoachMessages(user, nextMessages);
  return nextMessages;
}
