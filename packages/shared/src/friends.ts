export type AppLanguage = "ru" | "en";

export interface UserProfile {
  userId: number;
  displayName: string;
  hideProfile: boolean;
  notificationsEnabled: boolean;
  autoplay: boolean;
  language: AppLanguage;
}

export interface FriendSummary {
  userId: number;
  firstName: string;
  photoUrl?: string;
}

export const DISPLAY_NAME_MAX_LENGTH = 64;
