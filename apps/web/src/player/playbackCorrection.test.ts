import assert from "node:assert/strict";
import { test } from "node:test";
import { planPlaybackCorrection, type CorrectionInput } from "./playbackCorrection";

const base: CorrectionInput = {
  roomIsPlaying: true,
  hasLoaded: true,
  isBuffering: false,
  playerPaused: false,
  playBlocked: false,
  current: 30,
  expected: 30,
  atEnd: false,
  forceSeek: false,
  lastCommandedPlaying: true,
  msSinceLastCommand: 10_000,
  commandRetryMs: 2000,
  driftDeadzoneSeconds: 0.12,
  softCorrectionMaxSeconds: 5,
};

test("REGRESSION: room playing but player paused -> re-issue play, NEVER seek (the slideshow)", () => {
  const plan = planPlaybackCorrection({
    ...base,
    roomIsPlaying: true,
    playerPaused: true,
    current: 5,
    expected: 40, // 35s behind — the old code hard-seeked here every second
    lastCommandedPlaying: true, // already "commanded" play, but it didn't take
  });
  assert.equal(plan.playStalled, true);
  assert.equal(plan.drift, null, "must not seek/rate a paused player");
  assert.equal(plan.command, "play", "re-issue play instead");
  assert.equal(plan.isRetry, true);
});

test("a lost first play() (lastCommanded still null) also re-issues play, no seek", () => {
  const plan = planPlaybackCorrection({
    ...base,
    playerPaused: true,
    current: 0,
    expected: 12,
    lastCommandedPlaying: null,
  });
  assert.equal(plan.drift, null);
  assert.equal(plan.command, "play");
});

test("normal far-drift on a genuinely playing player still hard-seeks", () => {
  const plan = planPlaybackCorrection({ ...base, playerPaused: false, current: 10, expected: 40 });
  assert.equal(plan.playStalled, false);
  assert.equal(plan.drift, "seek");
});

test("small drift on a playing player is a rate nudge, not a seek", () => {
  const plan = planPlaybackCorrection({ ...base, current: 30, expected: 30.4 });
  assert.equal(plan.drift, "rate");
});

test("drift inside the deadzone does nothing", () => {
  const plan = planPlaybackCorrection({ ...base, current: 30, expected: 30.05 });
  assert.equal(plan.drift, null);
  assert.equal(plan.command, null);
});

test("while the play gate is up, nothing is done at all", () => {
  const plan = planPlaybackCorrection({
    ...base,
    playBlocked: true,
    playerPaused: true,
    current: 0,
    expected: 40,
  });
  assert.equal(plan.drift, null);
  assert.equal(plan.command, null);
});

test("past the end of the video: leave it alone, no command", () => {
  const plan = planPlaybackCorrection({ ...base, atEnd: true, current: 100, expected: 100 });
  assert.equal(plan.drift, "atEnd");
  assert.equal(plan.command, null);
});

test("retry is throttled — same state, too soon since the last command", () => {
  const plan = planPlaybackCorrection({
    ...base,
    playerPaused: true,
    current: 5,
    expected: 20,
    msSinceLastCommand: 500, // < commandRetryMs
  });
  assert.equal(plan.command, null, "waited too little since the last command");
  assert.equal(plan.drift, null, "still no seek while stalled");
});

test("a real pause transition issues pause()", () => {
  const plan = planPlaybackCorrection({
    ...base,
    roomIsPlaying: false,
    playerPaused: false,
    lastCommandedPlaying: true,
  });
  assert.equal(plan.command, "pause");
  assert.equal(plan.isRetry, false);
});

test("first sync while the room is paused: no pause() call (player already paused)", () => {
  const plan = planPlaybackCorrection({
    ...base,
    roomIsPlaying: false,
    playerPaused: true,
    lastCommandedPlaying: null,
  });
  assert.equal(plan.command, null);
  assert.equal(plan.isFirstCommand, true);
});
