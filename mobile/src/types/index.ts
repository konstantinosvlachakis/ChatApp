export interface Profile {
  user_id?: number;
  username: string;
  email?: string;
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

export interface ProfileListResponse {
  profiles: Array<{
    username: string;
    native_language?: string;
    languages_practicing?: string[];
    practice_language_levels?: Record<string, string>;
    profile_image_url?: string | null;
  }>;
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
