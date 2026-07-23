import { useCallback, useEffect, useRef } from "react";
import { computeExpectedPosition, DRIFT_TOLERANCE_SECONDS, ECHO_SUPPRESSION_MS } from "@stream/shared";
import type { PlaybackState, PlaybackSyncPayload } from "@stream/shared";
import type { RoomSocket } from "../socket/socketClient";
import type { PlayerHandle } from "./playerTypes";

export interface SyncedPlayback {
  playerRef: React.RefObject<PlayerHandle>;
  suppressed: React.MutableRefObject<boolean>;
  onPlay: (atSeconds: number) => void;
  onPause: (atSeconds: number) => void;
  onSeek: (atSeconds: number) => void;
}

/** Beyond this much drift, a rate nudge would take too long to catch up — hard-seek instead. */
const SOFT_CORRECTION_MAX_SECONDS = 5;
/** +/-6% — imperceptible in pitch/audio, closes a few seconds of drift within a few seconds. */
const SOFT_CORRECTION_RATE_DELTA = 0.06;
const SOFT_CORRECTION_SETTLE_SECONDS = 0.3;
const SOFT_CORRECTION_CHECK_MS = 400;

/**
 * Bridges a `VideoPlayer` and the room socket: applies incoming `playback:sync`
 * corrections (host-authoritative, server-timestamped) and forwards local user
 * actions back to the server. See packages/shared/src/sync.ts for the model.
 */
export function useSyncedPlayback(socket: RoomSocket, initialPlayback: PlaybackState | null): SyncedPlayback {
  const playerRef = useRef<PlayerHandle>(null);
  const suppressed = useRef(false);
  const lastLocalActionAt = useRef(0);
  const correctionInterval = useRef<ReturnType<typeof setInterval>>();

  const stopSoftCorrection = useCallback(() => {
    if (correctionInterval.current) {
      clearInterval(correctionInterval.current);
      correctionInterval.current = undefined;
      playerRef.current?.setPlaybackRate(1);
    }
  }, []);

  useEffect(() => stopSoftCorrection, [stopSoftCorrection]);

  const applyServerState = useCallback((payload: PlaybackState) => {
    const player = playerRef.current;
    if (!player) return;
    if (Date.now() - lastLocalActionAt.current < ECHO_SUPPRESSION_MS) return;

    stopSoftCorrection();

    suppressed.current = true;
    const expected = computeExpectedPosition(payload, Date.now());
    const drift = player.getCurrentTime() - expected;
    const absDrift = Math.abs(drift);

    if (absDrift > SOFT_CORRECTION_MAX_SECONDS) {
      // Too far off for a rate nudge to close in reasonable time — jump.
      player.seekTo(expected);
    } else if (absDrift > DRIFT_TOLERANCE_SECONDS && payload.isPlaying) {
      // Gently speed up/slow down instead of a hard jump-cut — the whole
      // point being nobody notices this happening, unlike a visible seek.
      player.setPlaybackRate(drift < 0 ? 1 + SOFT_CORRECTION_RATE_DELTA : 1 - SOFT_CORRECTION_RATE_DELTA);
      correctionInterval.current = setInterval(() => {
        const current = playerRef.current;
        if (!current) {
          stopSoftCorrection();
          return;
        }
        const stillExpected = computeExpectedPosition(payload, Date.now());
        if (Math.abs(current.getCurrentTime() - stillExpected) <= SOFT_CORRECTION_SETTLE_SECONDS) {
          stopSoftCorrection();
        }
      }, SOFT_CORRECTION_CHECK_MS);
    }

    if (payload.isPlaying) player.play();
    else player.pause();
    requestAnimationFrame(() => {
      suppressed.current = false;
    });
  }, [stopSoftCorrection]);

  useEffect(() => {
    const handleSync = (payload: PlaybackSyncPayload) => applyServerState(payload);
    socket.on("playback:sync", handleSync);
    return () => {
      socket.off("playback:sync", handleSync);
    };
  }, [socket, applyServerState]);

  useEffect(() => {
    if (!initialPlayback) return;
    const id = requestAnimationFrame(() => applyServerState(initialPlayback));
    return () => cancelAnimationFrame(id);
  }, [initialPlayback, applyServerState]);

  const emit = useCallback(
    (type: "play" | "pause" | "seek", atSeconds: number) => {
      // A fresh local action means the user just took over — don't let a
      // stale rate-nudge from an earlier correction keep running against it.
      stopSoftCorrection();
      lastLocalActionAt.current = Date.now();
      socket.emit(`playback:${type}`, { atSeconds, clientTimestamp: Date.now() });
    },
    [socket, stopSoftCorrection],
  );

  const onPlay = useCallback((atSeconds: number) => emit("play", atSeconds), [emit]);
  const onPause = useCallback((atSeconds: number) => emit("pause", atSeconds), [emit]);
  const onSeek = useCallback((atSeconds: number) => emit("seek", atSeconds), [emit]);

  return { playerRef, suppressed, onPlay, onPause, onSeek };
}
