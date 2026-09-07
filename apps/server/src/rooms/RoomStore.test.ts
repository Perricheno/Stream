import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { QUEUE_MAX_LENGTH, type QueueItem, type VideoSource } from "@stream/shared";
import {
  addMember,
  addQueueItem,
  advanceQueue,
  getOrCreateRoom,
  getRoom,
  isUserWatchingLibraryVideo,
  removeMember,
} from "./RoomStore";

let n = 0;
const freshRoomId = () => `TEST${n++}`;
const member = (userId: number, socketId = `s${userId}-${Math.random()}`) => ({ socketId, userId, firstName: `U${userId}` });
const lib = (videoId: string): VideoSource => ({ type: "library", videoId });
const queueItem = (id: string): QueueItem => ({ id, source: lib(id), addedByUserId: 1, addedByName: "U1" });

afterEach(() => mock.timers.reset());

test("new room starts host-less, source-less, paused at 0", () => {
  const room = getOrCreateRoom(freshRoomId());
  assert.equal(room.hostSocketId, "");
  assert.equal(room.source, null);
  assert.deepEqual(
    { p: room.playback.isPlaying, s: room.playback.positionSeconds },
    { p: false, s: 0 },
  );
});

test("first member becomes host; a later member does not", () => {
  const room = getOrCreateRoom(freshRoomId());
  const a = member(1);
  const b = member(2);
  addMember(room, a);
  assert.equal(room.hostSocketId, a.socketId);
  addMember(room, b);
  assert.equal(room.hostSocketId, a.socketId);
});

test("host reconnecting (same user, new socket) keeps host; a non-host reconnecting does not steal it", () => {
  const room = getOrCreateRoom(freshRoomId());
  const host1 = member(1, "sock-a");
  const guest = member(2, "sock-b");
  addMember(room, host1);
  addMember(room, guest);

  addMember(room, member(1, "sock-a2")); // host reconnects
  assert.equal(room.members.find((m) => m.socketId === room.hostSocketId)?.userId, 1);

  addMember(room, member(2, "sock-b2")); // guest reconnects
  assert.equal(room.members.find((m) => m.socketId === room.hostSocketId)?.userId, 1);
});

test("host leaving promotes the next member; playback state is untouched", () => {
  const room = getOrCreateRoom(freshRoomId());
  const host = member(1);
  const guest = member(2);
  addMember(room, host);
  addMember(room, guest);
  room.playback = { isPlaying: true, positionSeconds: 12.5, updatedAtServerTime: 1000 };

  removeMember(room, host.socketId);
  assert.equal(room.members.find((m) => m.socketId === room.hostSocketId)?.userId, 2);
  assert.deepEqual(room.playback, { isPlaying: true, positionSeconds: 12.5, updatedAtServerTime: 1000 });
});

test("room with no members lingers for the grace period, then is deleted", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const id = freshRoomId();
  const room = getOrCreateRoom(id);
  const only = member(1);
  addMember(room, only);
  removeMember(room, only.socketId);

  assert.ok(getRoom(id), "still present right after going empty");
  mock.timers.tick(9 * 60 * 1000);
  assert.ok(getRoom(id), "still present before grace elapses");
  mock.timers.tick(2 * 60 * 1000);
  assert.equal(getRoom(id), undefined, "gone once the 10-minute grace elapses");
});

test("a member rejoining within the grace period keeps the room alive", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const id = freshRoomId();
  const room = getOrCreateRoom(id);
  addMember(room, member(1, "s1"));
  removeMember(room, "s1");
  mock.timers.tick(5 * 60 * 1000);
  addMember(room, member(1, "s1-again"));
  mock.timers.tick(30 * 60 * 1000);
  assert.ok(getRoom(id), "rejoin cancelled the teardown");
});

test("advanceQueue pops the front to source and resets playback; false on empty", () => {
  const room = getOrCreateRoom(freshRoomId());
  room.playback = { isPlaying: true, positionSeconds: 99, updatedAtServerTime: 1 };
  assert.equal(advanceQueue(room), false);

  addQueueItem(room, queueItem("v1"));
  addQueueItem(room, queueItem("v2"));
  assert.equal(advanceQueue(room), true);
  assert.deepEqual(room.source, lib("v1"));
  assert.equal(room.playback.isPlaying, false);
  assert.equal(room.playback.positionSeconds, 0);
  assert.equal(room.queue.length, 1);
});

test("addQueueItem caps the queue length", () => {
  const room = getOrCreateRoom(freshRoomId());
  for (let i = 0; i < QUEUE_MAX_LENGTH; i++) assert.equal(addQueueItem(room, queueItem(`q${i}`)), true);
  assert.equal(addQueueItem(room, queueItem("overflow")), false);
  assert.equal(room.queue.length, QUEUE_MAX_LENGTH);
});

test("isUserWatchingLibraryVideo: true only for a member of a room currently playing that video", () => {
  const room = getOrCreateRoom(freshRoomId());
  addMember(room, member(1, "sa"));
  addMember(room, member(2, "sb"));
  room.source = lib("vid-A");

  assert.equal(isUserWatchingLibraryVideo(1, "vid-A"), true);
  assert.equal(isUserWatchingLibraryVideo(2, "vid-A"), true);
  assert.equal(isUserWatchingLibraryVideo(3, "vid-A"), false, "not a member");
  assert.equal(isUserWatchingLibraryVideo(1, "vid-B"), false, "different video");

  room.source = { type: "youtube", videoId: "yt" };
  assert.equal(isUserWatchingLibraryVideo(1, "vid-A"), false, "room moved off the library video");
});
