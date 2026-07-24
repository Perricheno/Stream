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

/** A friend's currently-open room — surfaced on Home so joining doesn't
 *  need an explicit invite/link each time (rooms are all reachable by code
 *  already; this just makes "someone I know is watching something right
 *  now" visible without them having to share anything). */
export interface ActiveFriendRoom {
  roomId: string;
  friendUserId: number;
  friendName: string;
  participantCount: number;
  hasSource: boolean;
}

export const DISPLAY_NAME_MAX_LENGTH = 64;
