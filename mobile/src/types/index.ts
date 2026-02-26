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
