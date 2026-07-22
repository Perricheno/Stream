import type { ChatMessage } from "./chat";

export type VideoSource =
  | { type: "youtube"; videoId: string }
  | { type: "file"; url: string; kind: "mp4" | "hls" };

export interface Participant {
  userId: number;
  firstName: string;
  photoUrl?: string;
  isHost: boolean;
}

export interface PlaybackState {
  isPlaying: boolean;
  positionSeconds: number;
  /** Server Date.now() when this state was last set. */
  updatedAtServerTime: number;
}

export interface RoomStatePayload {
  roomId: string;
  source: VideoSource | null;
  playback: PlaybackState;
  participants: Participant[];
  messages: ChatMessage[];
}
