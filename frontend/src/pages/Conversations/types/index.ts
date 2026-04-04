// api/types.ts
export interface User {
    id: number; // Replace with actual field names and types from your API response
    name: string;
    dateOfBirth?: string;
    newDate: string;
    location?: string; // Optional field
    about_me?: string; // Optional field
    languages?: string[];
    native_language?: string;
  }
  


export interface Conversation {
    id: number;
    sender: {
      id: number;
      username: string;
      profile_image_url: string;
      is_online?: boolean;
      last_seen?: string | null;
    };
    receiver: {
      id: number;
      username: string;
      profile_image_url: string;
      is_online?: boolean;
      last_seen?: string | null;
    };
    updated_at: string;
    unread_count?: number;
    last_message?: {
      id: number;
      text: string;
      status?: "sent" | "delivered" | "read";
      sender: {
        id: number;
        username: string;
      };
      timestamp: string;
    };
    pinned_messages?: Message[];
  }

  export interface Message {
    id: number;
    text: string;
    sender: {
      id: number;
      username: string;
    };
    timestamp: string;
    status?: "sent" | "delivered" | "read";
    edited_at?: string | null;
    attachment_url?: string; // Optional field for attachment URL
    attachment?: string | null;
    attachmentUrl?: string | null;
    is_pinned?: boolean;
    pinned_at?: string | null;
    pinned_by?: {
      id: number;
      username: string;
    } | null;
    reply_to?: {
      id: number;
      text: string;
      timestamp: string;
      sender: {
        id: number | null;
        username: string;
      };
    } | null;
    translated_text?: string | null;
    translated_source_language?: string | null;
    can_translate?: boolean;
    reactions?: {
      id: number;
      user_id: number;
      username: string;
      emoji: string;
    }[];
    current_user_reaction?: string | null;
  }
  
