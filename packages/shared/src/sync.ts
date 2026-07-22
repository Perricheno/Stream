import type { PlaybackState } from "./room";

export interface PlaybackSyncPayload extends PlaybackState {
  originUserId: number;
}

/** If a client's local position drifts from the expected position by more
 * than this, hard-seek to correct. Below this, do nothing to avoid seek-storms. */
export const DRIFT_TOLERANCE_SECONDS = 1.5;

/** How long a client ignores an incoming sync that matches its own just-sent
 * action, to avoid a self-correction jitter loop. */
export const ECHO_SUPPRESSION_MS = 800;

/** Reject initData older than this when validating on the backend. */
export const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

export function computeExpectedPosition(state: PlaybackState, nowServerTime: number): number {
  if (!state.isPlaying) return state.positionSeconds;
  const elapsedSeconds = (nowServerTime - state.updatedAtServerTime) / 1000;
  return state.positionSeconds + Math.max(0, elapsedSeconds);
}
