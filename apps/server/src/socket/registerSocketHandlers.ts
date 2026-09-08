import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  computeExpectedPosition,
  type ChatMessage,
  type ClientToServerEvents,
  type JoinRoomResult,
  type PauseReason,
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
  promoteNextHost,
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

/** How long after a socket `disconnect` before the room actually pauses and,
 *  if it was the host who dropped, promotes the next person — a
 *  backgrounding blip / network stutter reconnects well within this. */
const DISCONNECT_GRACE_MS = 10_000;

/**
 * Freezes the room at wherever the shared timeline has actually reached,
 * using the server's own clock rather than a position sent by a client —
 * the client asking for this is typically one whose player the OS already
 * suspended, so its own `currentTime` is stale by however long that took.
 *
 * Returns false if the room was already paused (nothing to do, and no event
 * worth broadcasting).
 */
function pauseRoomNow(room: Room): boolean {
  if (!room.playback.isPlaying) return false;
  room.playback = {
    isPlaying: false,
    positionSeconds: Math.max(0, computeExpectedPosition(room.playback, Date.now())),
    updatedAtServerTime: Date.now(),
  };
  return true;
}

/**
 * Server-authoritative playback sync: the room's `playback` (position +
 * isPlaying + the server's own timestamp) is the one shared truth. ANY
 * participant may move it via play/pause/seek — it's a small room of people
 * who trust each other, last write by server time wins — and everyone else's
 * client continuously computes where playback SHOULD be from that snapshot
 * (see computeExpectedPosition) rather than waiting on a relayed action.
 * "Host" now only governs the queue and kicking.
 */
export function registerSocketHandlers(io: StreamServer): void {
  io.on("connection", (socket) => {
    let currentRoomId: string | null = null;
    const uid = socket.data.user.id;

    function applyPlayback(kind: "play" | "pause" | "seek", isPlaying: boolean | undefined, payload: PlaybackActionPayload) {
      if (!currentRoomId) return;
      const room = getRoom(currentRoomId);
      if (!room) return;

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

    /** After a real (grace-elapsed) departure: pause the room and, if that
     *  person was host, hand the role to whoever's still here. */
    function finalizeDeparture(room: Room, gone: { userId: number; name: string; wasHost: boolean }) {
      if (room.members.length === 0) return; // the empty-room grace owns this case
      if (gone.wasHost && room.hostUserId === gone.userId) {
        promoteNextHost(room);
        io.to(room.id).emit("room:participants", toParticipants(room));
      }
      if (pauseRoomNow(room)) {
        logRoom("playback:paused", { room: room.id, byUserId: gone.userId, reason: "left", at: room.playback.positionSeconds });
        io.to(room.id).emit("playback:sync", { ...room.playback, originUserId: gone.userId });
        io.to(room.id).emit("playback:paused-by", { userId: gone.userId, userName: gone.name, reason: "left" });
      }
    }

    function leaveCurrentRoom(reason: "leave" | "disconnect") {
      if (!currentRoomId) return;
      const roomId = currentRoomId;
      const room = getRoom(roomId);
      if (room) {
        const wasHost = room.hostUserId === uid;
        const name = room.members.find((m) => m.socketId === socket.id)?.firstName ?? socket.data.user.firstName;
        removeMember(room, socket.id);
        logRoom("member:left", { room: roomId, userId: uid, reason, wasHost, remaining: room.members.length });

        if (reason === "leave") {
          // Explicit exit — no coming back, act now. finalizeDeparture emits
          // the (post-promotion) participant list itself.
          finalizeDeparture(room, { userId: uid, name, wasHost });
        } else {
          // A socket drop is usually a blip — show the person gone from the
          // bar, but don't reassign host or pause yet. Wait it out; addMember
          // cancels this the moment the same user rejoins.
          socket.to(roomId).emit("room:participants", toParticipants(room));
          const existing = room.disconnectTimers.get(uid);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(() => {
            room.disconnectTimers.delete(uid);
            const stillGone = !room.members.some((m) => m.userId === uid);
            if (stillGone) {
              logRoom("member:left-final", { room: roomId, userId: uid, wasHost });
              finalizeDeparture(room, { userId: uid, name, wasHost });
            }
          }, DISCONNECT_GRACE_MS);
          timer.unref?.();
          room.disconnectTimers.set(uid, timer);
        }
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
        isHost: room.hostUserId === uid,
        hostUserId: room.hostUserId,
        participants: room.members.length,
        playback: room.playback,
        hasSource: room.source !== null,
      });
    });

    socket.on("room:leave", () => leaveCurrentRoom("leave"));

    socket.on("playback:play", (payload) => applyPlayback("play", true, payload));
    socket.on("playback:pause", (payload) => applyPlayback("pause", false, payload));
    socket.on("playback:seek", (payload) => applyPlayback("seek", undefined, payload));

    // Pausing is deliberately open to every participant, unlike play/seek:
    // the point of watching together is that nobody's timeline runs on while
    // somebody isn't actually watching (app backgrounded, screen locked). The
    // position comes from the server's own clock — see pauseRoomNow.
    socket.on("playback:request-pause", ({ reason }) => {
      if (!currentRoomId) return;
      const room = getRoom(currentRoomId);
      if (!room) return;

      const safeReason: PauseReason = reason === "away" || reason === "left" ? reason : "manual";
      if (!pauseRoomNow(room)) return;

      const name = room.members.find((m) => m.socketId === socket.id)?.firstName ?? socket.data.user.firstName;
      logRoom("playback:paused", {
        room: currentRoomId,
        byUserId: uid,
        reason: safeReason,
        at: room.playback.positionSeconds,
      });
      // io.to (not socket.to): the sender's own player must converge on the
      // server-chosen position too — theirs was suspended and is behind.
      io.to(currentRoomId).emit("playback:sync", { ...room.playback, originUserId: uid });
      io.to(currentRoomId).emit("playback:paused-by", { userId: uid, userName: name, reason: safeReason });
    });

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
      if (!room || room.hostUserId !== uid) return; // host-only

      removeQueueItem(room, itemId);
      io.to(currentRoomId).emit("queue:updated", { queue: room.queue });
    });

    socket.on("queue:advance", () => {
      if (!currentRoomId) return;
      const room = getRoom(currentRoomId);
      if (!room || room.hostUserId !== uid) return; // host-only, avoids a double-pop race

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
      if (!room || room.hostUserId !== uid) return; // host-only

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
