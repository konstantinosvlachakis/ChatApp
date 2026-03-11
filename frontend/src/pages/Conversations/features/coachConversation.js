export const COACH_CONVERSATION_ID = "coach";
export const COACH_BOT_ID = -999;
export const COACH_CONVERSATION_UPDATED_EVENT = "coach-conversation-updated";

const getCoachStorageKey = (userId) => `chat:coach:messages:${userId || "guest"}`;

const getPracticeLanguage = (user) => {
  if (user?.base_translate_language) return user.base_translate_language;
  if (Array.isArray(user?.languages_practicing) && user.languages_practicing.length > 0) {
    return user.languages_practicing[0];
  }
  return user?.native_language || "english";
};

const createBotProfile = (language) => ({
  id: COACH_BOT_ID,
  username: "LangVoyage Coach",
  profile_image_url: "/logo192.png",
  is_virtual_online: true,
  language,
});

const createInitialMessages = (user) => {
  const language = getPracticeLanguage(user);
  return [
    {
      id: `coach-welcome-${language}`,
      text: `Hi ${user?.username || "there"} - I am your ${language} practice coach. Talk to me naturally, ask for corrections, roleplay, or tell me what you want to practise.`,
      sender: createBotProfile(language),
      timestamp: new Date().toISOString(),
      can_translate: true,
      reactions: [],
      current_user_reaction: null,
    },
  ];
};

export const readCoachMessages = (user) => {
  if (typeof window === "undefined") return createInitialMessages(user);
  const key = getCoachStorageKey(user?.user_id || user?.id);
  const raw = window.localStorage.getItem(key);
  if (!raw) return createInitialMessages(user);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return createInitialMessages(user);
    }
    return parsed;
  } catch {
    return createInitialMessages(user);
  }
};

export const persistCoachMessages = (user, messages) => {
  if (typeof window === "undefined") return;
  const key = getCoachStorageKey(user?.user_id || user?.id);
  window.localStorage.setItem(key, JSON.stringify(messages));
  window.dispatchEvent(new CustomEvent(COACH_CONVERSATION_UPDATED_EVENT));
};

export const getCoachConversation = (user) => {
  const language = getPracticeLanguage(user);
  const messages = readCoachMessages(user);
  const lastMessage = messages[messages.length - 1] || null;

  return {
    id: COACH_CONVERSATION_ID,
    sender: createBotProfile(language),
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

export const buildCoachReply = (user, prompt) => {
  const language = getPracticeLanguage(user);
  const normalized = String(prompt || "").trim();
  const lower = normalized.toLowerCase();

  if (!normalized) {
    return `Tell me anything in ${language} and I will keep the conversation going.`;
  }

  if (lower.includes("correct") || lower.includes("fix")) {
    return `Here is a cleaner version: "${normalized}". If you want, I can explain the grammar and give you two more natural alternatives in ${language}.`;
  }

  if (lower.includes("?")) {
    return `Good question. Answer me first in ${language}, then I will refine it and ask a follow-up so we keep practising naturally.`;
  }

  if (lower.split(" ").length <= 3) {
    return `Nice start. Expand that into a longer sentence in ${language} and include one detail about time, place, or feeling.`;
  }

  return `Good. I understood you. Now continue in ${language}: what would you say next if this were a real conversation? I can also correct your last message if you want.`;
};
