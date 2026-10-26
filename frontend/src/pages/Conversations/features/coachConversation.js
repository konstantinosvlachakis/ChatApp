export const COACH_CONVERSATION_ID = "coach";
export const COACH_BOT_ID = -999;
export const COACH_CONVERSATION_UPDATED_EVENT = "coach-conversation-updated";

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
    description: "Ask short questions and wait for the learner to answer.",
  },
  {
    id: "vocabulary_drill",
    label: "Vocabulary Drill",
    shortLabel: "Vocab",
    description: "Focus on targeted words, phrases, and recall.",
  },
];

export const COACH_QUICK_PROMPTS = [
  "Correct my last sentence and explain why.",
  "Let's roleplay ordering at a cafe.",
  "Quiz me with five short questions.",
  "Give me useful travel phrases.",
];

const LANGUAGE_LABELS = {
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

const getCoachStorageKey = (userId) => `chat:coach:messages:${userId || "guest"}`;
const getCoachPreferencesKey = (userId) => `chat:coach:preferences:${userId || "guest"}`;

const normalizeLanguage = (value) => String(value || "").trim().toLowerCase();

const toLanguageOption = (value) => {
  const normalized = normalizeLanguage(value);
  if (!normalized) return null;
  return {
    value: normalized,
    label:
      LANGUAGE_LABELS[normalized] ||
      normalized.charAt(0).toUpperCase() + normalized.slice(1),
  };
};

export const getCoachLanguageOptions = (user) => {
  const candidateValues = [
    user?.base_translate_language,
    ...(Array.isArray(user?.languages_practicing) ? user.languages_practicing : []),
    user?.native_language,
    "english",
    "french",
    "greek",
    "spanish",
  ];

  const seen = new Set();
  return candidateValues
    .map(toLanguageOption)
    .filter((option) => {
      if (!option || seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
};

export const getDefaultCoachLanguage = (user) => {
  const options = getCoachLanguageOptions(user);
  return options[0]?.value || "english";
};

const getDefaultCoachMode = () => COACH_MODES[0].id;

const createCoachAvatar = (language) => {
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

export const readCoachPreferences = (user) => {
  const defaults = {
    language: getDefaultCoachLanguage(user),
    mode: getDefaultCoachMode(),
  };

  if (typeof window === "undefined") return defaults;
  const key = getCoachPreferencesKey(user?.user_id || user?.id);
  const raw = window.localStorage.getItem(key);
  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw);
    const availableLanguages = new Set(getCoachLanguageOptions(user).map((option) => option.value));
    const availableModes = new Set(COACH_MODES.map((mode) => mode.id));

    return {
      language: availableLanguages.has(parsed?.language)
        ? parsed.language
        : defaults.language,
      mode: availableModes.has(parsed?.mode) ? parsed.mode : defaults.mode,
    };
  } catch {
    return defaults;
  }
};

export const persistCoachPreferences = (user, preferences) => {
  if (typeof window === "undefined") return;
  const key = getCoachPreferencesKey(user?.user_id || user?.id);
  window.localStorage.setItem(key, JSON.stringify(preferences));
  window.dispatchEvent(new CustomEvent(COACH_CONVERSATION_UPDATED_EVENT));
};

const createBotProfile = (language, modeId = getDefaultCoachMode()) => {
  const mode = COACH_MODES.find((entry) => entry.id === modeId) || COACH_MODES[0];
  return {
    id: COACH_BOT_ID,
    username: "Lumi",
    profile_image_url: createCoachAvatar(language),
    is_virtual_online: true,
    language,
    mode: mode.id,
    mode_label: mode.label,
  };
};

const createInitialMessages = (user, preferences) => {
  const language = preferences?.language || getDefaultCoachLanguage(user);
  const mode =
    COACH_MODES.find((entry) => entry.id === preferences?.mode) || COACH_MODES[0];
  return [
    {
      id: `coach-welcome-${language}-${mode.id}`,
      text: `Hi ${user?.username || "there"} - I'm Lumi, your ${LANGUAGE_LABELS[language] || language} practice companion. We are in ${mode.label.toLowerCase()} mode. Ask for corrections, roleplay, quizzes, or vocab drills whenever you want.`,
      sender: createBotProfile(language, mode.id),
      timestamp: new Date().toISOString(),
      can_translate: true,
      reactions: [],
      current_user_reaction: null,
    },
  ];
};

export const readCoachMessages = (user, preferences = readCoachPreferences(user)) => {
  if (typeof window === "undefined") return createInitialMessages(user, preferences);
  const key = getCoachStorageKey(user?.user_id || user?.id);
  const raw = window.localStorage.getItem(key);
  if (!raw) return createInitialMessages(user, preferences);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return createInitialMessages(user, preferences);
    }
    return parsed;
  } catch {
    return createInitialMessages(user, preferences);
  }
};

export const persistCoachMessages = (user, messages) => {
  if (typeof window === "undefined") return;
  const key = getCoachStorageKey(user?.user_id || user?.id);
  window.localStorage.setItem(key, JSON.stringify(messages));
  window.dispatchEvent(new CustomEvent(COACH_CONVERSATION_UPDATED_EVENT));
};

export const resetCoachConversation = (user, preferences) => {
  const nextMessages = createInitialMessages(user, preferences);
  persistCoachMessages(user, nextMessages);
  return nextMessages;
};

export const getCoachConversation = (user) => {
  const preferences = readCoachPreferences(user);
  const language = preferences.language;
  const messages = readCoachMessages(user, preferences);
  const lastMessage = messages[messages.length - 1] || null;

  return {
    id: COACH_CONVERSATION_ID,
    sender: createBotProfile(language, preferences.mode),
    receiver: {
      id: user?.user_id || user?.id || 0,
      username: user?.username || "You",
      profile_image_url: user?.profile_image_url || "/logo192.png",
    },
    updated_at: lastMessage?.timestamp || new Date().toISOString(),
    unread_count: 0,
    last_message: lastMessage
      ? {
          id: lastMessage.id,
          text: lastMessage.text,
          sender: {
            id: lastMessage.sender?.id,
            username: lastMessage.sender?.username,
          },
          timestamp: lastMessage.timestamp,
          status: "read",
        }
      : null,
    messages,
  };
};
