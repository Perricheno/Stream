import type { ChatMessage, ChatReplyPreview } from "./chat";
import type { QueueItem } from "./queue";
import type { Participant, RoomStatePayload, VideoSource } from "./room";
import type { PlaybackSyncPayload } from "./sync";

export interface JoinRoomResult {
  ok: boolean;
  error?: string;
  state?: RoomStatePayload;
  /** The server's own record of who you are (from validated initData) —
   *  the client should use this for every "is this me" comparison (host
   *  check, own-message check, etc.) instead of re-deriving its own id from
   *  the Telegram SDK a second time. Those two paths aren't guaranteed to
   *  agree: the SDK's typed initData parser can throw on some real clients
   *  (a documented issue: github.com/Telegram-Mini-Apps/telegram-apps/issues/683)
   *  and fall back to a mock identity for UI purposes, while the socket's
   *  own auth (which reads the raw initData string directly) still
   *  succeeds with the real one — silently desyncing "who the app thinks
   *  you are" from "who the server knows you are".
   */
  yourUserId?: number;
}

export interface JoinRoomPayload {
  roomId: string;
}

export interface PlaybackActionPayload {
  atSeconds: number;
  clientTimestamp: number;
}

/** Why the room was paused by someone other than a deliberate tap on pause. */
export type PauseReason = "away" | "left" | "manual";

export interface ClientToServerEvents {
  "room:join": (payload: JoinRoomPayload, cb: (res: JoinRoomResult) => void) => void;
  "room:leave": () => void;
  "playback:play": (payload: PlaybackActionPayload) => void;
  "playback:pause": (payload: PlaybackActionPayload) => void;
  "playback:seek": (payload: PlaybackActionPayload) => void;
  /** Pausing is the one playback action ANY participant may take, unlike
   *  play/seek (host-only). Sent when someone stops being able to watch —
   *  they backgrounded the app, locked the screen, or left the room — so the
   *  shared timeline doesn't run on without them. The server picks the
   *  position itself (from its own clock) rather than trusting the sender's,
   *  whose player may already have been suspended by the OS. */
  "playback:request-pause": (payload: { reason: PauseReason }) => void;
  "playback:change-source": (payload: { source: VideoSource }) => void;
  "chat:send": (payload: { text: string; replyTo?: ChatReplyPreview }) => void;
  /** Only the author's own client may edit/delete — the server ignores
   *  these from anyone else (see registerSocketHandlers.ts). */
  "chat:edit": (payload: { id: string; text: string }) => void;
  "chat:delete": (payload: { id: string }) => void;
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
  /** Purely informational — the server just relays it to the room for the
   *  participants list's sync-health dots, it never feeds back into the
   *  actual playback state (that stays server-authoritative, see sync.ts). */
  "sync:report": (payload: { driftSeconds: number; isBuffering: boolean }) => void;
}

export interface ServerToClientEvents {
  "room:state": (state: RoomStatePayload) => void;
  "room:participants": (participants: Participant[]) => void;
  "playback:sync": (payload: PlaybackSyncPayload) => void;
  "playback:source-changed": (payload: { source: VideoSource }) => void;
  "chat:message": (message: ChatMessage) => void;
  "chat:message-updated": (message: ChatMessage) => void;
  "chat:message-deleted": (payload: { id: string }) => void;
  "sync:status": (payload: { userId: number; driftSeconds: number; isBuffering: boolean; updatedAt: number }) => void;
  /** Sent alongside the playback:sync that actually paused, so the UI can
   *  explain WHY it stopped ("Аня свернула приложение") instead of the video
   *  just halting for no visible reason. */
  "playback:paused-by": (payload: { userId: number; userName: string; reason: PauseReason }) => void;
  "room:error": (payload: { code: string; message: string }) => void;
  /** Sent only to the removed participant. */
  "room:kicked": () => void;
  "queue:updated": (payload: { queue: QueueItem[] }) => void;
}
