import {
  CHAT_HISTORY_LIMIT,
  QUEUE_MAX_LENGTH,
  type ChatMessage,
  type Participant,
  type QueueItem,
  type RoomStatePayload,
} from "@stream/shared";
import type { Room, RoomMember } from "./roomTypes";

/** In-memory only — rooms are ephemeral and reset on server restart (see README). */
const rooms = new Map<string, Room>();

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

export function addMember(room: Room, member: RoomMember): void {
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

/** Removes a member by socket id. Promotes the next member to host if the host left, and drops the room once empty. */
export function removeMember(room: Room, socketId: string): void {
  room.members = room.members.filter((member) => member.socketId !== socketId);
  if (room.hostSocketId === socketId) {
    room.hostSocketId = room.members[0]?.socketId ?? "";
  }
  if (room.members.length === 0) {
    rooms.delete(room.id);
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
