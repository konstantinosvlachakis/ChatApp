export interface Profile {
  user_id?: number;
  username: string;
  native_language?: string;
  base_translate_language?: string;
  languages_practicing?: string[];
  bio?: string;
  age?: number | null;
  profile_image_url?: string;
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
  messages: ChatMessage[];
}

export interface ProfileListResponse {
  profiles: Array<{
    username: string;
    native_language?: string;
    languages_practicing?: string[];
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
