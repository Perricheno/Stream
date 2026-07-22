import type { ChatMessage } from "./chat";
import type { Participant, RoomStatePayload, VideoSource } from "./room";
import type { PlaybackSyncPayload } from "./sync";

export interface JoinRoomResult {
  ok: boolean;
  error?: string;
  state?: RoomStatePayload;
}

export interface JoinRoomPayload {
  roomId: string;
  /** Room-scoped display name override; empty/omitted uses the Telegram first name. */
  displayName?: string;
  /** If true, this participant is shown to others as "Аноним" with no photo. */
  hideProfile?: boolean;
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
  "reaction:send": (payload: { stickerId: string }) => void;
  "chat:send": (payload: { text: string }) => void;
}

export interface ServerToClientEvents {
  "room:state": (state: RoomStatePayload) => void;
  "room:participants": (participants: Participant[]) => void;
  "playback:sync": (payload: PlaybackSyncPayload) => void;
  "playback:source-changed": (payload: { source: VideoSource }) => void;
  "reaction:broadcast": (payload: { stickerId: string; fromUserId: number }) => void;
  "chat:message": (message: ChatMessage) => void;
  "room:error": (payload: { code: string; message: string }) => void;
}
