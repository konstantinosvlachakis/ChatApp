export interface ProfileData{
    
    username: string;
    imageURL: string;
    nativeLanguage: string;

}

export interface ProfileResponse {
    profiles: ProfileData[];
  }
  