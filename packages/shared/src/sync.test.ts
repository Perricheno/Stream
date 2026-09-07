import assert from "node:assert/strict";
import { test } from "node:test";
import { computeExpectedPosition } from "./sync";
import type { PlaybackState } from "./room";

const paused = (pos: number, at = 1_000_000): PlaybackState => ({
  isPlaying: false,
  positionSeconds: pos,
  updatedAtServerTime: at,
});
const playing = (pos: number, at: number): PlaybackState => ({
  isPlaying: true,
  positionSeconds: pos,
  updatedAtServerTime: at,
});

test("paused: expected position is exactly the stored position, regardless of clock", () => {
  assert.equal(computeExpectedPosition(paused(42), 9_999_999), 42);
  assert.equal(computeExpectedPosition(paused(0), 0), 0);
});

test("playing: advances by wall-clock seconds since the server stamp", () => {
  const state = playing(10, 1_000_000);
  assert.equal(computeExpectedPosition(state, 1_000_000), 10); // no time passed
  assert.equal(computeExpectedPosition(state, 1_002_500), 12.5); // +2.5s
  assert.equal(computeExpectedPosition(state, 1_060_000), 70); // +60s
});

test("playing: a server stamp in the future (client clock behind) never rewinds before the stored position", () => {
  const state = playing(30, 2_000_000);
  assert.equal(computeExpectedPosition(state, 1_999_000), 30);
});

test("playing past the end is NOT clamped here — duration is unknown to shared code", () => {
  // This is why useSyncedPlayback clamps to player.getDuration(): a short
  // clip left 'playing' with an empty queue would otherwise drive an
  // ever-growing expected position and endless re-seeking.
  const state = playing(0, 1_000_000);
  assert.equal(computeExpectedPosition(state, 1_000_000 + 3_600_000), 3600);
});
