import {
  CHAT_HISTORY_LIMIT,
  QUEUE_MAX_LENGTH,
  type ActiveFriendRoom,
  type ChatMessage,
  type Participant,
  type QueueItem,
  type RoomStatePayload,
} from "@stream/shared";
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
      hostSocketId: "",
      source: null,
      playback: initialPlayback(),
      members: [],
      messages: [],
      queue: [],
      emptyTimer: null,
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

/** One entry per (friend, room) they're currently a member of — a friend
 *  who's host of a room with others already in it still shows up once per
 *  room, not once per person in it. Scans the in-memory room map directly;
 *  fine at this scale (a personal-use app, not thousands of concurrent
 *  rooms) and avoids keeping a separate userId->room index in sync. */
export function listActiveRoomsForFriends(friendUserIds: number[]): ActiveFriendRoom[] {
  if (friendUserIds.length === 0) return [];
  const friendIdSet = new Set(friendUserIds);
  const result: ActiveFriendRoom[] = [];
  for (const room of rooms.values()) {
    const friendMember = room.members.find((member) => friendIdSet.has(member.userId));
    if (!friendMember) continue;
    result.push({
      roomId: room.id,
      friendUserId: friendMember.userId,
      friendName: friendMember.firstName,
      participantCount: room.members.length,
      hasSource: room.source !== null,
    });
  }
  return result;
}

export function addMember(room: Room, member: RoomMember): void {
  // Someone (re)joined — cancel any pending teardown from the room having
  // gone empty (see removeMember).
  if (room.emptyTimer) {
    clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
  }

  // A reconnect gets a fresh socket id, so if this user was already the host
  // under their previous connection, carry host status forward — otherwise
  // `hostSocketId` would keep pointing at a now-dead socket and they'd
  // silently lose host controls on every reconnect.
  const wasHost = room.hostSocketId !== "" && room.members.some(
    (existing) => existing.userId === member.userId && existing.socketId === room.hostSocketId,
  );
  room.members = room.members.filter((existing) => existing.userId !== member.userId);
  room.members.push(member);
  if (!room.hostSocketId || wasHost) room.hostSocketId = member.socketId;
}

/**
 * Removes a member by socket id and promotes the next member to host if the
 * host left. A room with no members left isn't deleted immediately — it's
 * kept around for a grace period (see ROOM_EMPTY_GRACE_MS) so a brief
 * disconnect (network blip, the webview getting backgrounded) doesn't wipe
 * out the video, queue, and chat history from under someone about to
 * reconnect. Only torn down once the grace period elapses with still no one back.
 */
export function removeMember(room: Room, socketId: string): void {
  room.members = room.members.filter((member) => member.socketId !== socketId);
  if (room.hostSocketId === socketId) {
    room.hostSocketId = room.members[0]?.socketId ?? "";
  }
  if (room.members.length === 0 && !room.emptyTimer) {
    room.emptyTimer = setTimeout(() => {
      if (room.members.length === 0) rooms.delete(room.id);
    }, ROOM_EMPTY_GRACE_MS);
  }
}

export function toParticipants(room: Room): Participant[] {
  return room.members.map((member) => ({
    userId: member.userId,
    firstName: member.firstName,
    photoUrl: member.photoUrl,
    isHost: member.socketId === room.hostSocketId,
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
