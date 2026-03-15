// api/types.ts
export interface User {
    id?: number;
    user_id?: number;
    username?: string;
    name?: string;
    dateOfBirth?: string;
    date_of_birth?: string;
    newDate?: string;
    location?: string;
    location_updated_at?: string | null;
    about_me?: string;
    languages?: string[];
    languages_practicing?: string[];
    native_language?: string;
    base_translate_language?: string;
    email?: string;
    profile_image_url?: string;
    complementary_image_1_url?: string;
    complementary_image_2_url?: string;
    avatar_ring_color?: string;
    age?: number | null;
  }
  


export interface Conversation {
    id: number;
    sender: {
      id: number;
      username: string;
      profile_image_url: string;
    };
    receiver: {
      id: number;
      username: string;
      profile_image_url: string;
    };
    updated_at: string;
    last_message?: {
      id: number;
      text: string;
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
  
