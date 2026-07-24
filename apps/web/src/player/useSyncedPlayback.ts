import { useCallback, useEffect, useRef } from "react";
import { computeExpectedPosition, DRIFT_TOLERANCE_SECONDS, ECHO_SUPPRESSION_MS } from "@stream/shared";
import type { PlaybackState, PlaybackSyncPayload } from "@stream/shared";
import type { RoomSocket } from "../socket/socketClient";
import type { PlayerHandle } from "./playerTypes";
import { useServerClock } from "./useServerClock";

export interface SyncedPlayback {
  playerRef: React.RefObject<PlayerHandle>;
  suppressed: React.MutableRefObject<boolean>;
  onPlay: (atSeconds: number) => void;
  onPause: (atSeconds: number) => void;
  onSeek: (atSeconds: number) => void;
  /** Signals a genuine network/buffering stall (not a sync correction) —
   *  drift correction suppresses itself while this is true, see below. */
  onBuffering: (isBuffering: boolean) => void;
}

/** Beyond this much drift, a rate nudge would take too long to catch up — hard-seek instead. */
const SOFT_CORRECTION_MAX_SECONDS = 5;
/** +/-10% — still an imperceptible speed change (browsers pitch-correct
 *  audio automatically), closes a second of drift in ~10s instead of ~17s.
 *  Tightened alongside DRIFT_TOLERANCE_SECONDS so a correction that does
 *  start actually catches up quickly instead of visibly trailing behind. */
const SOFT_CORRECTION_RATE_DELTA = 0.1;
const SOFT_CORRECTION_SETTLE_SECONDS = 0.3;
const SOFT_CORRECTION_CHECK_MS = 400;
/** How often to re-check drift against the last known state even with no
 *  new event — a stall (buffering, the tab freezing for a moment) otherwise
 *  only gets corrected whenever some unrelated action happens to trigger a
 *  fresh playback:sync, which might not be for a long time. Halved from 4s:
 *  the whole point of this check is catching drift before it's noticeable,
 *  and 4s of unchecked drift on a device that's decoding slowly is exactly
 *  the kind of gap users were seeing between two phones side by side. */
const PERIODIC_RECHECK_MS = 2000;
/** A freshly-mounted YouTube/Vimeo player can take far longer than one
 *  frame to become controllable (loading the iframe API, the postMessage
 *  handshake) — retry applying the room's current state at this interval
 *  until the player actually exists, instead of trying exactly once and
 *  silently giving up if that one attempt was too early. */
const INITIAL_SYNC_RETRY_MS = 200;
const INITIAL_SYNC_MAX_ATTEMPTS = 50; // ~10s

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
  const lastKnownStateRef = useRef<PlaybackState | null>(initialPlayback);
  const isBufferingRef = useRef(false);
  const { serverNow } = useServerClock(socket);

  const stopSoftCorrection = useCallback(() => {
    if (correctionInterval.current) {
      clearInterval(correctionInterval.current);
      correctionInterval.current = undefined;
      playerRef.current?.setPlaybackRate(1);
    }
  }, []);

  useEffect(() => stopSoftCorrection, [stopSoftCorrection]);

  const onBuffering = useCallback(
    (isBuffering: boolean) => {
      isBufferingRef.current = isBuffering;
      // A rate nudge assumes normal playback is progressing — pointless (and
      // visually confusing) to leave one running once the player itself has
      // stopped consuming time due to a stall.
      if (isBuffering) stopSoftCorrection();
    },
    [stopSoftCorrection],
  );

  const applyServerState = useCallback((payload: PlaybackState) => {
    lastKnownStateRef.current = payload;
    const player = playerRef.current;
    if (!player) return;
    if (Date.now() - lastLocalActionAt.current < ECHO_SUPPRESSION_MS) return;

    stopSoftCorrection();
    suppressed.current = true;

    // A genuine network stall: seeking or nudging the rate while the player
    // is already starved for data just restarts its buffering at a new
    // position, risking a stall-seek-stall loop instead of letting the
    // browser recover on its own. play()/pause() below still always reflect
    // the real command regardless — only the drift-closing part backs off.
    if (!isBufferingRef.current) {
      const expected = computeExpectedPosition(payload, serverNow());
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
          if (isBufferingRef.current) return;
          const current = playerRef.current;
          if (!current) {
            stopSoftCorrection();
            return;
          }
          const stillExpected = computeExpectedPosition(payload, serverNow());
          if (Math.abs(current.getCurrentTime() - stillExpected) <= SOFT_CORRECTION_SETTLE_SECONDS) {
            stopSoftCorrection();
          }
        }, SOFT_CORRECTION_CHECK_MS);
      }
    }

    if (payload.isPlaying) player.play();
    else player.pause();
    requestAnimationFrame(() => {
      suppressed.current = false;
    });
  }, [stopSoftCorrection, serverNow]);

  useEffect(() => {
    const handleSync = (payload: PlaybackSyncPayload) => applyServerState(payload);
    socket.on("playback:sync", handleSync);
    return () => {
      socket.off("playback:sync", handleSync);
    };
  }, [socket, applyServerState]);

  useEffect(() => {
    lastKnownStateRef.current = initialPlayback;
    if (!initialPlayback) return;
    let cancelled = false;
    let attempts = 0;

    const tryApply = () => {
      if (cancelled) return;
      if (playerRef.current?.isReady()) {
        applyServerState(initialPlayback);
        return;
      }
      attempts += 1;
      if (attempts >= INITIAL_SYNC_MAX_ATTEMPTS) return;
      setTimeout(tryApply, INITIAL_SYNC_RETRY_MS);
    };

    tryApply();
    return () => {
      cancelled = true;
    };
  }, [initialPlayback, applyServerState]);

  // Self-heals drift on a timer instead of only ever reacting to someone
  // else's action — without this, one client's stall/buffer had nothing
  // to correct it until the next unrelated play/pause/seek happened
  // anywhere in the room, which could be minutes away or might never come
  // if playback just runs uninterrupted start to finish.
  useEffect(() => {
    const interval = setInterval(() => {
      const state = lastKnownStateRef.current;
      if (state) applyServerState(state);
    }, PERIODIC_RECHECK_MS);
    return () => clearInterval(interval);
  }, [applyServerState]);

  // Reports this client's own drift/buffering state for the participants
  // list's sync-health dots — purely informational, doesn't feed back into
  // the correction logic above at all (see sync:report's doc comment).
  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      const state = lastKnownStateRef.current;
      if (!player?.isReady() || !state) return;
      const expected = computeExpectedPosition(state, serverNow());
      socket.emit("sync:report", {
        driftSeconds: player.getCurrentTime() - expected,
        isBuffering: isBufferingRef.current,
      });
    }, PERIODIC_RECHECK_MS);
    return () => clearInterval(interval);
  }, [socket, serverNow]);

  const emit = useCallback(
    (type: "play" | "pause" | "seek", atSeconds: number) => {
      // A fresh local action means the user just took over — don't let a
      // stale rate-nudge from an earlier correction keep running against it.
      stopSoftCorrection();
      lastLocalActionAt.current = Date.now();
      // The server never echoes an action back to whoever sent it (only to
      // everyone ELSE in the room), so without this, the sender's own
      // lastKnownStateRef would keep pointing at whatever the room's state
      // was BEFORE this action (e.g. still "paused at 0" right after the
      // host presses play) — and the periodic self-check a few lines down
      // would then "correct" the sender's own, actually-correct player back
      // to that stale snapshot on its next tick. Mirroring the server's own
      // update here (see registerSocketHandlers.ts's applyPlayback) keeps it
      // accurate immediately, locally, without waiting on a round trip that
      // isn't coming.
      const isPlaying = type === "seek" ? (lastKnownStateRef.current?.isPlaying ?? true) : type === "play";
      lastKnownStateRef.current = { isPlaying, positionSeconds: atSeconds, updatedAtServerTime: serverNow() };
      socket.emit(`playback:${type}`, { atSeconds, clientTimestamp: Date.now() });
    },
    [socket, stopSoftCorrection, serverNow],
  );

  const onPlay = useCallback((atSeconds: number) => emit("play", atSeconds), [emit]);
  const onPause = useCallback((atSeconds: number) => emit("pause", atSeconds), [emit]);
  const onSeek = useCallback((atSeconds: number) => emit("seek", atSeconds), [emit]);

  return { playerRef, suppressed, onPlay, onPause, onSeek, onBuffering };
}
