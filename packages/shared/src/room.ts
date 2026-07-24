import type { ChatMessage } from "./chat";
import type { QueueItem } from "./queue";

export type VideoSource =
  | { type: "youtube"; videoId: string }
  | { type: "vimeo"; videoId: string }
  | { type: "file"; url: string; kind: "mp4" | "hls" }
  /** Last-resort fallback when a page only exposes an embeddable player, not a raw
   *  stream — rendered as a sandboxed iframe with no playback sync (see IframePlayerAdapter). */
  | { type: "iframe"; url: string; title?: string };

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
  queue: QueueItem[];
}
