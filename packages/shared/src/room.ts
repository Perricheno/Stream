import type { ChatMessage } from "./chat";
import type { QueueItem } from "./queue";

export type VideoSource =
  | { type: "youtube"; videoId: string }
  | { type: "vimeo"; videoId: string }
  | { type: "file"; url: string; kind: "mp4" | "hls" }
  /** A video in the private library — downloaded from a link (yt-dlp), pulled
   *  from a Google Drive share, or sent straight to the bot as a file.
   *  Playback streams from GET /api/videos/:id/stream behind a short-lived
   *  signed token; while the row is still status='downloading' the player
   *  shows import progress instead of a stream (see VideoPlayer). */
  | { type: "library"; videoId: string; title?: string };

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
