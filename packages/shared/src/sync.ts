import type { PlaybackState } from "./room";

export interface PlaybackSyncPayload extends PlaybackState {
  originUserId: number;
}

/** How much drift counts as "notably" out of sync for display purposes (the
 * participants list's sync-health dot, see ParticipantsModal.tsx) — not the
 * threshold the correction logic itself acts on. That one lives in
 * useSyncedPlayback.ts as its own, much smaller DRIFT_DEADZONE_SECONDS,
 * since actively correcting drift and flagging it as a visible "something's
 * wrong" signal call for very different sensitivities: the correction
 * should kick in on drift far below what's worth alarming anyone about. */
export const DRIFT_TOLERANCE_SECONDS = 0.75;

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
