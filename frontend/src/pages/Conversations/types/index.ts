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
  }

  export interface Message {
    id: number;
    text: string;
    sender: {
      id: number;
      username: string;
    };
    timestamp: string;
    attachment_url?: string; // Optional field for attachment URL

  }
  
