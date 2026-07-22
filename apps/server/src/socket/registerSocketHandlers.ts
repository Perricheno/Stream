import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  JoinRoomResult,
  PlaybackActionPayload,
  ServerToClientEvents,
} from "@stream/shared";
import { addMember, getOrCreateRoom, getRoom, removeMember, toParticipants, toStatePayload } from "../rooms/RoomStore";
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
      const member: RoomMember = {
        socketId: socket.id,
        userId: socket.data.user.id,
        firstName: socket.data.user.firstName,
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

    socket.on("disconnect", leaveCurrentRoom);
  });
}
