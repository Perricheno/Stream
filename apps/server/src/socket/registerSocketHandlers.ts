import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  type ChatMessage,
  type ClientToServerEvents,
  type JoinRoomResult,
  type PlaybackActionPayload,
  type ServerToClientEvents,
} from "@stream/shared";
import {
  addChatMessage,
  addMember,
  getOrCreateRoom,
  getRoom,
  removeMember,
  toParticipants,
  toStatePayload,
} from "../rooms/RoomStore";
import type { RoomMember } from "../rooms/roomTypes";
import type { SocketData } from "./types";

type StreamServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/**
 * Host-authoritative, last-write-wins playback sync: whoever's play/pause/seek
 * reaches the server first wins, the server stamps it with its own clock, and
 * broadcasts to everyone else — see packages/shared/src/sync.ts for the
 * client-side drift-correction this pairs with.
 */
export function registerSocketHandlers(io: StreamServer): void {
  io.on("connection", (socket) => {
    let currentRoomId: string | null = null;

    function applyPlayback(isPlaying: boolean | undefined, payload: PlaybackActionPayload) {
      if (!currentRoomId) return;
      const room = getRoom(currentRoomId);
      if (!room) return;

      room.playback = {
        isPlaying: isPlaying ?? room.playback.isPlaying,
        positionSeconds: payload.atSeconds,
        updatedAtServerTime: Date.now(),
      };

      socket.to(currentRoomId).emit("playback:sync", { ...room.playback, originUserId: socket.data.user.id });
    }

    function leaveCurrentRoom() {
      if (!currentRoomId) return;
      const roomId = currentRoomId;
      const room = getRoom(roomId);
      if (room) {
        removeMember(room, socket.id);
        socket.to(roomId).emit("room:participants", toParticipants(room));
      }
      socket.leave(roomId);
      currentRoomId = null;
    }

    socket.on("room:join", (payload, callback) => {
      const roomId = payload.roomId.trim().toUpperCase();
      if (!roomId) {
        const result: JoinRoomResult = { ok: false, error: "Room id is required" };
        callback(result);
        return;
      }

      const room = getOrCreateRoom(roomId);
      const member: RoomMember = payload.hideProfile
        ? { socketId: socket.id, userId: socket.data.user.id, firstName: "Аноним" }
        : {
            socketId: socket.id,
            userId: socket.data.user.id,
            firstName: payload.displayName?.trim() || socket.data.user.firstName,
            photoUrl: socket.data.user.photoUrl,
          };
      addMember(room, member);
      socket.join(roomId);
      currentRoomId = roomId;

      const result: JoinRoomResult = { ok: true, state: toStatePayload(room) };
      callback(result);
      socket.to(roomId).emit("room:participants", toParticipants(room));
    });

    socket.on("room:leave", leaveCurrentRoom);

    socket.on("playback:play", (payload) => applyPlayback(true, payload));
    socket.on("playback:pause", (payload) => applyPlayback(false, payload));
    socket.on("playback:seek", (payload) => applyPlayback(undefined, payload));

    socket.on("playback:change-source", ({ source }) => {
      if (!currentRoomId) return;
      const room = getRoom(currentRoomId);
      if (!room) return;

      room.source = source;
      room.playback = { isPlaying: false, positionSeconds: 0, updatedAtServerTime: Date.now() };
      io.to(currentRoomId).emit("playback:source-changed", { source });
    });

    socket.on("reaction:send", ({ stickerId }) => {
      if (!currentRoomId) return;
      io.to(currentRoomId).emit("reaction:broadcast", { stickerId, fromUserId: socket.data.user.id });
    });

    socket.on("chat:send", ({ text }) => {
      if (!currentRoomId) return;
      const trimmed = text.trim().slice(0, CHAT_MESSAGE_MAX_LENGTH);
      if (!trimmed) return;
      const room = getRoom(currentRoomId);
      if (!room) return;

      const member = room.members.find((m) => m.socketId === socket.id);
      const message: ChatMessage = {
        id: randomUUID(),
        fromUserId: socket.data.user.id,
        fromName: member?.firstName ?? socket.data.user.firstName,
        text: trimmed,
        sentAt: Date.now(),
      };
      addChatMessage(room, message);
      io.to(currentRoomId).emit("chat:message", message);
    });

    socket.on("disconnect", leaveCurrentRoom);
  });
}
