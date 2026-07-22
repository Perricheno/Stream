import type { ChatMessage, PlaybackState, QueueItem, VideoSource } from "@stream/shared";

export interface RoomMember {
  socketId: string;
  userId: number;
  firstName: string;
  photoUrl?: string;
}

export interface Room {
  id: string;
  hostSocketId: string;
  source: VideoSource | null;
  playback: PlaybackState;
  members: RoomMember[];
  messages: ChatMessage[];
  queue: QueueItem[];
}
