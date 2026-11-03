export interface Profile {
  user_id?: number;
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
  profile_image_url?: string | null;
  is_online?: boolean;
}

export interface ChatMessage {
  id: number;
  text?: string | null;
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

export interface Conversation {
  id: number;
  sender: ConversationParticipant;
  receiver: ConversationParticipant;
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
