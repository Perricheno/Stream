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

/** A currently-open room — surfaced on Home so joining doesn't need an
 *  explicit invite/link shared every time (rooms are already reachable by
 *  code; this just makes "something is being watched right now" visible
 *  without that). Not friend-gated: this is a small app for one person and
 *  their circle, not a public service, so every open room is visible to
 *  everyone using the app rather than requiring an in-app friend
 *  relationship first. */
export interface ActiveRoom {
  roomId: string;
  hostUserId: number;
  hostName: string;
  participantCount: number;
  hasSource: boolean;
}

export const DISPLAY_NAME_MAX_LENGTH = 64;
