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
  