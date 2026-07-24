import type { ChatMessage } from "./chat";
import type { QueueItem } from "./queue";
import type { Participant, RoomStatePayload, VideoSource } from "./room";
import type { PlaybackSyncPayload } from "./sync";

export interface JoinRoomResult {
  ok: boolean;
  error?: string;
  state?: RoomStatePayload;
}

export interface JoinRoomPayload {
  roomId: string;
}

export interface PlaybackActionPayload {
  atSeconds: number;
  clientTimestamp: number;
}

export interface ClientToServerEvents {
  "room:join": (payload: JoinRoomPayload, cb: (res: JoinRoomResult) => void) => void;
  "room:leave": () => void;
  "playback:play": (payload: PlaybackActionPayload) => void;
  "playback:pause": (payload: PlaybackActionPayload) => void;
  "playback:seek": (payload: PlaybackActionPayload) => void;
  "playback:change-source": (payload: { source: VideoSource }) => void;
  "chat:send": (payload: { text: string }) => void;
  /** Host-only; the server ignores this from anyone else. */
  "room:kick": (payload: { targetUserId: number }) => void;
  /** Anyone in the room can queue up a video. */
  "queue:add": (payload: { source: VideoSource }) => void;
  /** Host-only; the server ignores this from anyone else. */
  "queue:remove": (payload: { itemId: string }) => void;
  /** Host-only; pops the front of the queue into `source`. No-ops if the queue is empty. */
  "queue:advance": () => void;
  /** Stateless clock-offset probe (Cristian's algorithm) — the server just
   *  echoes back its own current time, no room/auth context needed. Sent
   *  repeatedly from a fresh connection and periodically afterward so each
   *  client can compute how far its own clock is from the server's, since
   *  `playback:sync`'s `updatedAtServerTime` is only meaningful if compared
   *  against an equivalently-scaled clock rather than the client's own
   *  (possibly skewed) one. */
  "time:sync": (payload: { clientSentAt: number }, cb: (res: { serverTime: number }) => void) => void;
}

export interface ServerToClientEvents {
  "room:state": (state: RoomStatePayload) => void;
  "room:participants": (participants: Participant[]) => void;
  "playback:sync": (payload: PlaybackSyncPayload) => void;
  "playback:source-changed": (payload: { source: VideoSource }) => void;
  "chat:message": (message: ChatMessage) => void;
  "room:error": (payload: { code: string; message: string }) => void;
  /** Sent only to the removed participant. */
  "room:kicked": () => void;
  "queue:updated": (payload: { queue: QueueItem[] }) => void;
}
