import { useRef, type RefObject } from "react";
import type { VideoSource } from "@stream/shared";
import { Html5PlayerAdapter } from "./Html5PlayerAdapter";
import { YouTubePlayerAdapter } from "./YouTubePlayerAdapter";
import { usePlayerProgress } from "./usePlayerProgress";
import { VideoControlsOverlay } from "./VideoControlsOverlay";
import type { PlayerAdapterEvents, PlayerHandle } from "./playerTypes";
import styles from "./VideoPlayer.module.css";

interface VideoPlayerProps extends PlayerAdapterEvents {
  source: VideoSource;
  suppressed: React.MutableRefObject<boolean>;
  playerRef: RefObject<PlayerHandle>;
}

/** Single entry point the app renders — picks the right adapter, and owns the
 * aspect-ratio container plus the custom minimal controls overlay. */
export function VideoPlayer({ source, playerRef, suppressed, onPlay, onPause, onSeek }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const progress = usePlayerProgress(playerRef);

  return (
    <div className={styles.container} ref={containerRef}>
      {source.type === "youtube" ? (
        <YouTubePlayerAdapter
          ref={playerRef}
          videoId={source.videoId}
          suppressed={suppressed}
          onPlay={onPlay}
          onPause={onPause}
          onSeek={onSeek}
        />
      ) : (
        <Html5PlayerAdapter
          ref={playerRef}
          source={source}
          suppressed={suppressed}
          onPlay={onPlay}
          onPause={onPause}
          onSeek={onSeek}
        />
      )}
      <VideoControlsOverlay playerRef={playerRef} progress={progress} fullscreenTargetRef={containerRef} />
    </div>
  );
}
