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

/**
 * Bridges a `VideoPlayer` and the room socket: applies incoming `playback:sync`
 * corrections (host-authoritative, server-timestamped) and forwards local user
 * actions back to the server. See packages/shared/src/sync.ts for the model.
 */
export function useSyncedPlayback(socket: RoomSocket, initialPlayback: PlaybackState | null): SyncedPlayback {
  const playerRef = useRef<PlayerHandle>(null);
  const suppressed = useRef(false);
  const lastLocalActionAt = useRef(0);

  const applyServerState = useCallback((payload: PlaybackState) => {
    const player = playerRef.current;
    if (!player) return;
    if (Date.now() - lastLocalActionAt.current < ECHO_SUPPRESSION_MS) return;

    suppressed.current = true;
    const expected = computeExpectedPosition(payload, Date.now());
    const drift = Math.abs(player.getCurrentTime() - expected);
    if (drift > DRIFT_TOLERANCE_SECONDS) player.seekTo(expected);
    if (payload.isPlaying) player.play();
    else player.pause();
    requestAnimationFrame(() => {
      suppressed.current = false;
    });
  }, []);

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
      lastLocalActionAt.current = Date.now();
      socket.emit(`playback:${type}`, { atSeconds, clientTimestamp: Date.now() });
    },
    [socket],
  );

  const onPlay = useCallback((atSeconds: number) => emit("play", atSeconds), [emit]);
  const onPause = useCallback((atSeconds: number) => emit("pause", atSeconds), [emit]);
  const onSeek = useCallback((atSeconds: number) => emit("seek", atSeconds), [emit]);

  return { playerRef, suppressed, onPlay, onPause, onSeek };
}
