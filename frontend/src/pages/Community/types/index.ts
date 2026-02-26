export interface ProfileData{
    
    username: string;
    imageURL: string;
    nativeLanguage: string;

}

export interface ProfileResponse {
    profiles: ProfileData[];
    pagination?: {
      page: number;
      page_size: number;
      total_pages: number;
      total_count: number;
      has_next: boolean;
      has_previous: boolean;
    };
  }
  
