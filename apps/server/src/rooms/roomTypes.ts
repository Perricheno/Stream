import type { ChatMessage, PlaybackState, QueueItem, VideoSource } from "@stream/shared";

export interface RoomMember {
  socketId: string;
  userId: number;
  firstName: string;
  photoUrl?: string;
}

export interface Room {
  id: string;
  /** Identifies the host by user, not socket — a reconnect gets a fresh
   *  socket id but is the same person, and the Telegram WebView drops its
   *  socket on every backgrounding, so a socket-keyed host quietly moved to
   *  whoever was next in the list on every app switch. Only meaningful for
   *  queue control and kicking now; play/pause/seek are open to everyone. */
  hostUserId: number | null;
  source: VideoSource | null;
  playback: PlaybackState;
  members: RoomMember[];
  messages: ChatMessage[];
  queue: QueueItem[];
  /** Pending deletion timer while the room has no members — lets a reconnect within the grace period find everything (video, queue, chat) still intact. */
  emptyTimer: ReturnType<typeof setTimeout> | null;
  /** Per-user "did they really leave" timers. A socket `disconnect` (a
   *  backgrounding blip, a network stutter) starts one; the user rejoining
   *  cancels it. Only when it fires does the room actually pause and, if that
   *  user was host, promote the next person. */
  disconnectTimers: Map<number, ReturnType<typeof setTimeout>>;
}
