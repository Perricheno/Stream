import {
  CHAT_HISTORY_LIMIT,
  QUEUE_MAX_LENGTH,
  type ActiveRoom,
  type ChatMessage,
  type Participant,
  type QueueItem,
  type RoomStatePayload,
} from "@stream/shared";
import { logRoom } from "../observability/log";
import type { Room, RoomMember } from "./roomTypes";

/** In-memory only — rooms are ephemeral and reset on server restart (see README). */
const rooms = new Map<string, Room>();

/** How long a room survives with no members before it's actually torn down — covers a brief disconnect/reconnect (network blip, backgrounding) without losing the video, queue, or chat history. */
const ROOM_EMPTY_GRACE_MS = 10 * 60 * 1000;

function initialPlayback() {
  return { isPlaying: false, positionSeconds: 0, updatedAtServerTime: Date.now() };
}

export function getOrCreateRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      hostUserId: null,
      source: null,
      playback: initialPlayback(),
      members: [],
      messages: [],
      queue: [],
      emptyTimer: null,
      disconnectTimers: new Map(),
    };
    rooms.set(roomId, room);
  }
  return room;
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function getRoomCount(): number {
  return rooms.size;
}

/** One entry per currently-active room (at least one member actually
 *  connected — a room can briefly linger in the map with zero members
 *  during its post-empty grace period, see removeMember, and that's not
 *  "active"). No friendship gate: this is a small app for one person and
 *  their circle, not a public service, so every open room is visible to
 *  everyone rather than requiring an explicit in-app friend relationship
 *  first. Scans the in-memory room map directly; fine at this scale (not
 *  thousands of concurrent rooms) and avoids keeping a separate index. */
export function listActiveRooms(): ActiveRoom[] {
  const result: ActiveRoom[] = [];
  for (const room of rooms.values()) {
    if (room.members.length === 0) continue;
    // The nominal host may be momentarily absent (a reconnect blip within the
    // disconnect grace) — fall back to the first present member so the room
    // still shows up instead of blinking out of the active list.
    const host = room.members.find((member) => member.userId === room.hostUserId) ?? room.members[0];
    result.push({
      roomId: room.id,
      hostUserId: host.userId,
      hostName: host.firstName,
      participantCount: room.members.length,
      hasSource: room.source !== null,
    });
  }
  return result;
}

/**
 * Whether `userId` is currently in a room that's playing library video
 * `videoId`. This — not "did they add it" — is what gates streaming access
 * (see http/videoLibraryRoutes.ts): a guest invited into a room has to be
 * able to watch a video someone else downloaded, or shared viewing breaks on
 * the first video that isn't yours.
 */
export function isUserWatchingLibraryVideo(userId: number, videoId: string): boolean {
  for (const room of rooms.values()) {
    if (room.source?.type !== "library" || room.source.videoId !== videoId) continue;
    if (room.members.some((member) => member.userId === userId)) return true;
  }
  return false;
}

export function addMember(room: Room, member: RoomMember): void {
  // Someone (re)joined — cancel any pending teardown from the room having
  // gone empty (see removeMember).
  if (room.emptyTimer) {
    clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
  }
  // ...and any pending "did they really leave" timer for this user — they're
  // back, so the room must not pause or reassign host on their account.
  const pending = room.disconnectTimers.get(member.userId);
  if (pending) {
    clearTimeout(pending);
    room.disconnectTimers.delete(member.userId);
  }

  room.members = room.members.filter((existing) => existing.userId !== member.userId);
  room.members.push(member);
  // First person in claims host; a returning host is still the host (it's
  // keyed by userId), so there's nothing to carry forward.
  if (room.hostUserId === null) room.hostUserId = member.userId;
}

/**
 * Promotes the next present member to host — call only once a departed host's
 * disconnect grace has elapsed without them returning (see the socket
 * handler), or on an explicit room:leave.
 */
export function promoteNextHost(room: Room): number | null {
  room.hostUserId = room.members[0]?.userId ?? null;
  logRoom("host:promoted", { room: room.id, newHostUserId: room.hostUserId, playback: room.playback });
  return room.hostUserId;
}

/**
 * Removes a member by socket id. Does NOT reassign host — that's deferred to
 * the disconnect-grace timer in the socket handler so a backgrounding blip
 * doesn't move the role. A room with no members left isn't deleted
 * immediately either — it's kept for a grace period (ROOM_EMPTY_GRACE_MS) so
 * a reconnect finds the video/queue/chat intact.
 */
export function removeMember(room: Room, socketId: string): void {
  room.members = room.members.filter((member) => member.socketId !== socketId);
  if (room.members.length === 0 && !room.emptyTimer) {
    logRoom("room:empty", { room: room.id, graceMs: ROOM_EMPTY_GRACE_MS });
    room.emptyTimer = setTimeout(() => {
      if (room.members.length === 0) {
        rooms.delete(room.id);
        logRoom("room:deleted", { room: room.id });
      }
    }, ROOM_EMPTY_GRACE_MS);
    // A pending teardown timer shouldn't be a reason for the process to stay
    // alive on its own (it isn't, in prod — the socket listener is — but this
    // keeps test processes from hanging on the 10-minute delay).
    room.emptyTimer.unref?.();
  }
}

export function toParticipants(room: Room): Participant[] {
  return room.members.map((member) => ({
    userId: member.userId,
    firstName: member.firstName,
    photoUrl: member.photoUrl,
    isHost: member.userId === room.hostUserId,
  }));
}

export function toStatePayload(room: Room): RoomStatePayload {
  return {
    roomId: room.id,
    source: room.source,
    playback: room.playback,
    participants: toParticipants(room),
    messages: room.messages,
    queue: room.queue,
  };
}

/** Appends a chat message, capping history so rooms don't grow unbounded. */
export function addChatMessage(room: Room, message: ChatMessage): void {
  room.messages.push(message);
  if (room.messages.length > CHAT_HISTORY_LIMIT) {
    room.messages.splice(0, room.messages.length - CHAT_HISTORY_LIMIT);
  }
}

/** Ownership (only the author may edit their own message) is checked by the
 *  caller — this just applies the mutation once that's confirmed. */
export function editChatMessage(room: Room, messageId: string, text: string): ChatMessage | null {
  const message = room.messages.find((m) => m.id === messageId);
  if (!message) return null;
  message.text = text;
  message.editedAt = Date.now();
  return message;
}

export function deleteChatMessage(room: Room, messageId: string): boolean {
  const before = room.messages.length;
  room.messages = room.messages.filter((m) => m.id !== messageId);
  return room.messages.length < before;
}

/** Appends a queue item, capping length so a room can't be griefed into an unbounded queue. */
export function addQueueItem(room: Room, item: QueueItem): boolean {
  if (room.queue.length >= QUEUE_MAX_LENGTH) return false;
  room.queue.push(item);
  return true;
}

export function removeQueueItem(room: Room, itemId: string): void {
  room.queue = room.queue.filter((item) => item.id !== itemId);
}

/** Pops the front of the queue as the new source + resets playback. Returns false if the queue was empty. */
export function advanceQueue(room: Room): boolean {
  const next = room.queue.shift();
  if (!next) return false;
  room.source = next.source;
  room.playback = initialPlayback();
  return true;
}
