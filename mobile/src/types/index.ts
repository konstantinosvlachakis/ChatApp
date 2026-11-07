/** Who may correct my messages: always, only messages I flag, or nobody. */
export type CorrectionPreference = "often" | "when_asked" | "off";

export interface Profile {
  user_id?: number;
  /** Own and public profile; missing on older servers (treat as "often"). */
  correction_preference?: CorrectionPreference;
  username: string;
  email?: string;
  /** Own profile only. Missing on older servers: treat `undefined` as verified. */
  email_verified?: boolean;
  date_of_birth?: string;
  location?: string;
  location_updated_at?: string | null;
  native_language?: string;
  base_translate_language?: string;
  languages_practicing?: string[];
  practice_language_levels?: Record<string, string>;
  bio?: string;
  age?: number | null;
  learning_goal?: string;
  avatar_ring_color?: string;
  profile_image_url?: string;
  complementary_image_1_url?: string;
  complementary_image_2_url?: string;
  support_email?: string;
  is_blocked_by_me?: boolean;
  has_blocked_me?: boolean;
  is_following?: boolean;
  follows_you?: boolean;
  reviews?: Array<{
    author?: string;
    rating?: number;
    comment?: string;
  }>;
  recent_profile_viewers?: Array<{
    user_id: number;
    username: string;
    native_language?: string;
    profile_image_url?: string | null;
    viewed_at: string;
  }>;
}

export interface ConversationParticipant {
  id: number;
  username: string;
  /** Sent by the API (ProfileSerializer); used to pick the voice for "Speak". */
  native_language?: string | null;
  profile_image_url?: string | null;
  is_online?: boolean;
  /** Message senders (ProfileSummary). */
  correction_preference?: CorrectionPreference;
}

/** A partner's suggested rewrite of a message (one per corrector, oldest first). */
export interface MessageCorrection {
  id: number;
  corrector: { id: number; username: string };
  corrected_text: string;
  note: string;
  created_at: string;
  updated_at: string;
}

/** Sticker message media as served (`url` null if the sticker left the pack). */
export interface StickerMedia {
  pack: string;
  id: string;
  label: string;
  url: string | null;
}

/** GIF message media (GIPHY); also one result of `GET /gifs/`. */
export interface GifMedia {
  provider: "giphy";
  id: string;
  title: string;
  url: string;
  preview_url: string;
  still_url: string | null;
  width: number;
  height: number;
}

export interface Sticker {
  id: string;
  /** "<pack>:<id>", sent as `sticker`. */
  ref: string;
  label: string;
  url: string;
}

export interface StickerPack {
  id: string;
  name: string;
  stickers: Sticker[];
}

export type MessageKind = "text" | "sticker" | "gif";

export interface ChatMessage {
  id: number;
  text?: string | null;
  /** Missing on older servers = "text". */
  kind?: MessageKind;
  media?: StickerMedia | GifMedia | null;
  status?: "sent" | "delivered" | "read";
  sender: ConversationParticipant;
  attachment_url?: string | null;
  timestamp: string;
  edited_at?: string | null;
  is_pinned?: boolean;
  pinned_at?: string | null;
  pinned_by?: {
    id: number;
    username: string;
  } | null;
  translated_text?: string | null;
  translated_source_language?: string | null;
  can_translate?: boolean;
  reply_to?: {
    id: number;
    text?: string | null;
    kind?: MessageKind;
    media?: StickerMedia | GifMedia | null;
    timestamp?: string;
    sender?: {
      id?: number;
      username?: string;
    };
  } | null;
  reactions?: Array<{
    id: number;
    user_id: number;
    username: string;
    emoji: string;
  }>;
  current_user_reaction?: string | null;
  /** The sender asked for corrections on this message. */
  correction_requested?: boolean;
  /** Partners may correct it (text message, sender's preference allows it). Not per viewer. */
  accepts_corrections?: boolean;
  corrections?: MessageCorrection[];
  /** Client-only: set on the optimistic bubble while an attachment upload is in flight. */
  local_status?: "sending";
  /** Client-only: content type of a locally picked attachment (optimistic bubble). */
  local_mime_type?: string | null;
  /**
   * Client-only list key: the optimistic bubble's key, carried over to the saved message that
   * replaces it so the FlatList cell is reused (no remount / image flash).
   */
  local_key?: string;
}

/** A group member (`active`) or invitee (`pending`); see backend ConversationSerializer. */
export interface GroupParticipant {
  user: ConversationParticipant & { native_language?: string | null };
  role: "owner" | "member";
  status: "active" | "pending";
  nickname: string;
  joined_at: string | null;
  last_read_at: string | null;
}

export interface GroupInvite {
  conversation_id: number;
  name: string;
  display_name: string;
  invited_by: ConversationParticipant | null;
  members: ConversationParticipant[];
  member_count: number;
  invited_at: string;
}

export interface Conversation {
  id: number;
  /** "group" only when the list/detail includes groups (older payloads omit it = direct). */
  kind?: "direct" | "group";
  name?: string;
  display_name?: string | null;
  /** Groups: active members + pending invitees; direct chats: []. */
  participants?: GroupParticipant[];
  my_role?: "owner" | "member" | null;
  /** Direct chats: the person who started it. Groups: the creator. */
  sender: ConversationParticipant;
  /** null for groups. */
  receiver: ConversationParticipant | null;
  created_at: string;
  updated_at: string;
  last_message: ChatMessage | null;
  unread_count: number;
  pinned_messages?: ChatMessage[];
  messages: ChatMessage[];
}

/** `match` on each People card (server-computed for the viewer). */
export interface PeopleMatch {
  /** Their native language is one I practise (any level). */
  teaches_me: boolean;
  /** They practise a language I speak (my native one, or one I practise at Advanced/Fluent). */
  learns_mine: boolean;
  /** Both of the above ("Perfect exchange"). */
  reciprocal: boolean;
  score?: number;
  /** Their native language when it is one I practise. */
  they_teach?: string | null;
  /** First language they practise that I speak. */
  they_learn?: string | null;
  /** How I speak `they_learn`. */
  you_speak?: "native" | "advanced" | "fluent" | null;
}

/** Item of `GET /api/profile/data` (PeopleCard in system-map). No id, bio or exact presence. */
export interface PeopleCard {
  username: string;
  is_following?: boolean;
  follows_you?: boolean;
  native_language?: string;
  languages_practicing?: string[];
  practice_language_levels?: Record<string, string>;
  learning_goal?: string;
  profile_image_url?: string | null;
  match?: PeopleMatch;
  /** City only (first part of their location), never the country or coordinates. */
  city?: string | null;
  /** Coarse activity: "Active today" / "Active this week" / null. */
  active_label?: string | null;
  /** Joined in the last 7 days. */
  is_new?: boolean;
}

/** `filters` in the People payload: chip options and quick-filter availability. */
export interface PeopleFilterInfo {
  they_speak_options?: string[];
  they_learn_options?: string[];
  near_available?: boolean;
  near_city?: string | null;
  near_scope?: "city" | "country" | null;
  my_level_available?: boolean;
}

export interface ProfileListResponse {
  profiles: PeopleCard[];
  /** Total for the current filters (same as pagination.total_count). */
  total?: number;
  filters?: PeopleFilterInfo;
  /** Only with `counts=1`: both sections for the current filters. */
  counts?: { perfect: number; others: number };
  pagination: {
    page: number;
    page_size: number;
    total_pages: number;
    total_count: number;
    has_next: boolean;
    has_previous: boolean;
  };
}

export interface ModerationSummary {
  blocked_profiles: Array<{
    username: string;
    profile_image_url?: string | null;
    created_at: string;
  }>;
  reported_profiles: Array<{
    username: string;
    profile_image_url?: string | null;
    reason: string;
    details?: string;
    created_at: string;
  }>;
}

export type PhrasebookSource = "manual" | "message" | "translation" | "correction";

/** `GET /api/phrasebook/` entry (private to its owner). */
export interface PhrasebookEntry {
  id: number;
  text: string;
  meaning: string;
  note: string;
  context: string;
  /** Lowercase language name, or "". */
  language: string;
  source: PhrasebookSource;
  source_message_id: number | null;
  source_conversation_id: number | null;
  created_at: string;
  updated_at: string;
  due_at: string;
  interval_days: number;
  repetitions: number;
  lapses: number;
  review_count: number;
  last_reviewed_at: string | null;
}

export interface PhrasebookPage {
  entries: PhrasebookEntry[];
  pagination: {
    page: number;
    page_size: number;
    total_pages: number;
    total_count: number;
    has_next: boolean;
    has_previous: boolean;
  };
  due_count: number;
  languages: string[];
}

export interface PhrasebookReviewBatch {
  /** Due cards, oldest due first (at most 20). */
  cards: PhrasebookEntry[];
  due_count: number;
  total_count: number;
  reviewed_today: number;
  next_due_at: string | null;
}

export type PhrasebookReviewResult = "again" | "hard" | "good" | "easy";

// Guided exchange sessions ("20 minutes together", one-to-one chats; see system-map api-contract).
export type ExchangeSessionStatus = "pending" | "active" | "ended" | "declined" | "cancelled" | "expired";

export interface ExchangeSessionTopic {
  id: string;
  title: string;
  prompts: string[];
}

export interface ExchangeSessionLanguageSummary {
  /** Lowercase language name. */
  language: string;
  minutes: number;
  /** Messages per user id (string keys). */
  messages: Record<string, number>;
  message_count: number;
}

export interface ExchangeSessionSummary {
  /** First language, then second. */
  languages: ExchangeSessionLanguageSummary[];
  total_minutes: number;
  corrections: Array<{ id: number; message_id: number; corrector_id: number }>;
  correction_count: number;
  corrections_truncated: boolean;
}

export interface ExchangeSession {
  id: number;
  conversation_id: number;
  status: ExchangeSessionStatus;
  created_by: { id: number; username: string };
  partner: { id: number; username: string };
  duration_minutes: number;
  first_language: string;
  second_language: string;
  /** Server snapshot at `server_time` (active only); clients recompute it from the timestamps. */
  current_language: string | null;
  topic: ExchangeSessionTopic | null;
  topic_source: "ai" | "library" | "custom" | null;
  created_at: string;
  expires_at: string | null;
  started_at: string | null;
  halfway_at: string | null;
  switched_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  /** null with status "ended" = the timer ran out. */
  ended_by_id: number | null;
  summary: ExchangeSessionSummary | null;
  server_time: string;
}

/** `GET /api/conversations/<id>/session/`. */
export interface ConversationSessionInfo {
  session: ExchangeSession | null;
  languages: string[];
  /** [partner native, my native]. */
  default_languages: string[];
  durations: number[];
}

export type ExchangeSessionAction = "accept" | "decline" | "cancel" | "switch" | "topic" | "end";
