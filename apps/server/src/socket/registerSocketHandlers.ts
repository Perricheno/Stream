import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  type ChatMessage,
  type ClientToServerEvents,
  type JoinRoomResult,
  type PlaybackActionPayload,
  type QueueItem,
  type ServerToClientEvents,
} from "@stream/shared";
import {
  addChatMessage,
  addMember,
  addQueueItem,
  advanceQueue,
  deleteChatMessage,
  editChatMessage,
  getOrCreateRoom,
  getRoom,
  removeMember,
  removeQueueItem,
  toParticipants,
  toStatePayload,
} from "../rooms/RoomStore";
import { getProfile } from "../db/userRepository";
import { logRoom } from "../observability/log";
import type { Room, RoomMember } from "../rooms/roomTypes";
import type { SocketData } from "./types";

type StreamServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

function hostUserId(room: Room): number | null {
  return room.members.find((m) => m.socketId === room.hostSocketId)?.userId ?? null;
}

/**
 * Host-authoritative playback sync: the room's `playback` (position + isPlaying
 * + the server's own timestamp) is the one shared truth, and only the current
 * host can move it — everyone else's client continuously computes where
 * playback SHOULD be from that snapshot (see computeExpectedPosition in
 * packages/shared/src/sync.ts) rather than waiting on a peer's relayed
 * action, so a viewer's own local hiccup (buffering, the app being
 * backgrounded, a dying connection) can't touch the shared state at all.
 *
 * This used to accept play/pause/seek from ANY participant, not just the
 * host, despite the doc comment already claiming host-authority — a single
 * viewer's own player stalling or pausing itself while backgrounding/
 * disconnecting got relayed as if it were an authoritative action, pausing
 * the room for everyone else too. `getRoom`'s host is always someone
 * currently connected (removeMember promotes the next member the instant
 * the host disconnects), so playback keeps moving without needing anyone
 * still present to actively be "driving" it.
 */
export function registerSocketHandlers(io: StreamServer): void {
  io.on("connection", (socket) => {
    let currentRoomId: string | null = null;
    const uid = socket.data.user.id;

    function applyPlayback(kind: "play" | "pause" | "seek", isPlaying: boolean | undefined, payload: PlaybackActionPayload) {
      if (!currentRoomId) return;
      const room = getRoom(currentRoomId);
      if (!room) return;

      const isHost = room.hostSocketId === socket.id;
      if (!isHost) {
        // Not an error — a non-host's own player pausing itself (buffering,
        // backgrounding) fires this; it just must not move the shared state.
        logRoom("playback:rejected-not-host", { room: currentRoomId, userId: uid, kind, atSeconds: payload.atSeconds });
        return;
      }

      // Clamp: a buggy/hostile client shouldn't be able to park the room's
      // timeline at 1e9 seconds. The upper bound is the client's job (it
      // knows the duration); this just refuses the obviously-absurd.
      const atSeconds = Math.max(0, Number.isFinite(payload.atSeconds) ? payload.atSeconds : 0);
      room.playback = {
        isPlaying: isPlaying ?? room.playback.isPlaying,
        positionSeconds: atSeconds,
        updatedAtServerTime: Date.now(),
      };

      logRoom("playback:set", {
        room: currentRoomId,
        byUserId: uid,
        kind,
        isPlaying: room.playback.isPlaying,
        positionSeconds: atSeconds,
        updatedAtServerTime: room.playback.updatedAtServerTime,
      });

      socket.to(currentRoomId).emit("playback:sync", { ...room.playback, originUserId: uid });
    }

    function leaveCurrentRoom(reason: "leave" | "disconnect") {
      if (!currentRoomId) return;
      const roomId = currentRoomId;
      const room = getRoom(roomId);
      if (room) {
        const wasHost = room.hostSocketId === socket.id;
        removeMember(room, socket.id);
        const newHost = hostUserId(room);
        logRoom("member:left", {
          room: roomId,
          userId: uid,
          reason,
          wasHost,
          newHostUserId: wasHost ? newHost : undefined,
          remaining: room.members.length,
        });
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

      const existed = getRoom(roomId) !== undefined;
      const room = getOrCreateRoom(roomId);
      const profile = getProfile(uid);
      const hideProfile = profile?.hideProfile ?? false;
      const member: RoomMember = hideProfile
        ? { socketId: socket.id, userId: uid, firstName: "Аноним" }
        : {
            socketId: socket.id,
            userId: uid,
            firstName: profile?.displayName?.trim() || socket.data.user.firstName,
            photoUrl: socket.data.user.photoUrl,
          };
      addMember(room, member);
      socket.join(roomId);
      currentRoomId = roomId;

      const result: JoinRoomResult = { ok: true, state: toStatePayload(room), yourUserId: uid };
      callback(result);
      socket.to(roomId).emit("room:participants", toParticipants(room));

      logRoom("member:joined", {
        room: roomId,
        userId: uid,
        createdRoom: !existed,
        isHost: room.hostSocketId === socket.id,
        hostUserId: hostUserId(room),
        participants: room.members.length,
        playback: room.playback,
        hasSource: room.source !== null,
      });
    });

    socket.on("room:leave", () => leaveCurrentRoom("leave"));

    socket.on("playback:play", (payload) => applyPlayback("play", true, payload));
    socket.on("playback:pause", (payload) => applyPlayback("pause", false, payload));
    socket.on("playback:seek", (payload) => applyPlayback("seek", undefined, payload));

    socket.on("playback:change-source", ({ source }) => {
      if (!currentRoomId) return;
      const room = getRoom(currentRoomId);
      if (!room) return;

      room.source = source;
      room.playback = { isPlaying: false, positionSeconds: 0, updatedAtServerTime: Date.now() };
      logRoom("source:changed", { room: currentRoomId, byUserId: uid, sourceType: source.type });
      io.to(currentRoomId).emit("playback:source-changed", { source });
    });

    socket.on("chat:send", ({ text, replyTo }) => {
      if (!currentRoomId) return;
      const trimmed = text.trim().slice(0, CHAT_MESSAGE_MAX_LENGTH);
      if (!trimmed) return;
      const room = getRoom(currentRoomId);
      if (!room) return;

      const member = room.members.find((m) => m.socketId === socket.id);
      const message: ChatMessage = {
        id: randomUUID(),
        fromUserId: uid,
        fromName: member?.firstName ?? socket.data.user.firstName,
        text: trimmed,
        sentAt: Date.now(),
        replyTo,
      };
      addChatMessage(room, message);
      io.to(currentRoomId).emit("chat:message", message);
    });

    socket.on("chat:edit", ({ id, text }) => {
      if (!currentRoomId) return;
      const trimmed = text.trim().slice(0, CHAT_MESSAGE_MAX_LENGTH);
      if (!trimmed) return;
      const room = getRoom(currentRoomId);
      if (!room) return;
      const existing = room.messages.find((m) => m.id === id);
      if (!existing || existing.fromUserId !== uid) return; // only the author may edit

      const updated = editChatMessage(room, id, trimmed);
      if (updated) io.to(currentRoomId).emit("chat:message-updated", updated);
    });

    socket.on("chat:delete", ({ id }) => {
      if (!currentRoomId) return;
      const room = getRoom(currentRoomId);
      if (!room) return;
      const existing = room.messages.find((m) => m.id === id);
      if (!existing || existing.fromUserId !== uid) return; // only the author may delete

      if (deleteChatMessage(room, id)) io.to(currentRoomId).emit("chat:message-deleted", { id });
    });

    socket.on("queue:add", ({ source }) => {
      if (!currentRoomId) return;
      const room = getRoom(currentRoomId);
      if (!room) return;

      const member = room.members.find((m) => m.socketId === socket.id);
      const item: QueueItem = {
        id: randomUUID(),
        source,
        addedByUserId: uid,
        addedByName: member?.firstName ?? socket.data.user.firstName,
      };
      if (!addQueueItem(room, item)) return;
      logRoom("queue:add", { room: currentRoomId, byUserId: uid, sourceType: source.type, queueLength: room.queue.length });
      io.to(currentRoomId).emit("queue:updated", { queue: room.queue });
    });

    socket.on("queue:remove", ({ itemId }) => {
      if (!currentRoomId) return;
      const room = getRoom(currentRoomId);
      if (!room || room.hostSocketId !== socket.id) return; // host-only

      removeQueueItem(room, itemId);
      io.to(currentRoomId).emit("queue:updated", { queue: room.queue });
    });

    socket.on("queue:advance", () => {
      if (!currentRoomId) return;
      const room = getRoom(currentRoomId);
      if (!room || room.hostSocketId !== socket.id) return; // host-only, avoids a double-pop race

      if (!advanceQueue(room)) {
        logRoom("queue:advance-empty", { room: currentRoomId, byUserId: uid });
        return;
      }
      logRoom("queue:advance", { room: currentRoomId, byUserId: uid, sourceType: room.source!.type, queueLength: room.queue.length });
      io.to(currentRoomId).emit("playback:source-changed", { source: room.source! });
      io.to(currentRoomId).emit("queue:updated", { queue: room.queue });
    });

    socket.on("room:kick", ({ targetUserId }) => {
      if (!currentRoomId) return;
      const room = getRoom(currentRoomId);
      if (!room || room.hostSocketId !== socket.id) return; // host-only

      const target = room.members.find((m) => m.userId === targetUserId);
      if (!target || target.socketId === socket.id) return;

      removeMember(room, target.socketId);
      logRoom("member:kicked", { room: currentRoomId, byUserId: uid, targetUserId });
      io.to(target.socketId).emit("room:kicked");
      io.sockets.sockets.get(target.socketId)?.leave(currentRoomId);
      io.to(currentRoomId).emit("room:participants", toParticipants(room));
    });

    socket.on("time:sync", (_payload, cb) => cb({ serverTime: Date.now() }));

    socket.on("sync:report", ({ driftSeconds, isBuffering }) => {
      if (!currentRoomId) return;
      // Logged for every client every ~1s — low volume, and it's the only
      // server-side window into how far each viewer actually is from the
      // shared timeline (their console `[sync]` log has the rest).
      logRoom("sync:report", {
        room: currentRoomId,
        userId: uid,
        driftSeconds: Math.round(driftSeconds * 1000) / 1000,
        isBuffering,
      });
      // Includes the sender too (not socket.to) — this is diagnostic-only,
      // so there's no echo-jitter concern like with playback actions, and
      // it's simplest for every client (including the reporter) to read
      // everyone's health the same way.
      io.to(currentRoomId).emit("sync:status", {
        userId: uid,
        driftSeconds,
        isBuffering,
        updatedAt: Date.now(),
      });
    });

    socket.on("disconnect", () => leaveCurrentRoom("disconnect"));
  });
}
