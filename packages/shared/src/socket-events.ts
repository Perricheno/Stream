import type { Participant, RoomStatePayload, VideoSource } from "./room";
import type { PlaybackSyncPayload } from "./sync";

export interface JoinRoomResult {
  ok: boolean;
  error?: string;
  state?: RoomStatePayload;
}

export interface PlaybackActionPayload {
  atSeconds: number;
  clientTimestamp: number;
}

export interface ClientToServerEvents {
  "room:join": (payload: { roomId: string }, cb: (res: JoinRoomResult) => void) => void;
  "room:leave": () => void;
  "playback:play": (payload: PlaybackActionPayload) => void;
  "playback:pause": (payload: PlaybackActionPayload) => void;
  "playback:seek": (payload: PlaybackActionPayload) => void;
  "playback:change-source": (payload: { source: VideoSource }) => void;
  "reaction:send": (payload: { stickerId: string }) => void;
}

export interface ServerToClientEvents {
  "room:state": (state: RoomStatePayload) => void;
  "room:participants": (participants: Participant[]) => void;
  "playback:sync": (payload: PlaybackSyncPayload) => void;
  "playback:source-changed": (payload: { source: VideoSource }) => void;
  "reaction:broadcast": (payload: { stickerId: string; fromUserId: number }) => void;
  "room:error": (payload: { code: string; message: string }) => void;
}
