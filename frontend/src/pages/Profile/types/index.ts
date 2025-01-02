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
  