import { useEffect, useState } from "react";
import type { PlayerHandle } from "./playerTypes";

export interface PlayerProgress {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

const POLL_INTERVAL_MS = 250;

/**
 * Read-only progress observer for driving a seek-bar UI. Deliberately
 * separate from useSyncedPlayback — this never touches echo-suppression or
 * drift-correction state, it just samples the player.
 */
export function usePlayerProgress(playerRef: React.RefObject<PlayerHandle>): PlayerProgress {
  const [progress, setProgress] = useState<PlayerProgress>({ isPlaying: false, currentTime: 0, duration: 0 });

  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      setProgress({
        isPlaying: !player.isPaused(),
        currentTime: player.getCurrentTime(),
        duration: player.getDuration(),
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [playerRef]);

  return progress;
}
