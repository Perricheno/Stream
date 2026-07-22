import type { Ref } from "react";
import type { VideoSource } from "@stream/shared";
import { Html5PlayerAdapter } from "./Html5PlayerAdapter";
import { YouTubePlayerAdapter } from "./YouTubePlayerAdapter";
import type { PlayerAdapterEvents, PlayerHandle } from "./playerTypes";

interface VideoPlayerProps extends PlayerAdapterEvents {
  source: VideoSource;
  suppressed: React.MutableRefObject<boolean>;
  playerRef: Ref<PlayerHandle>;
}

/** Single entry point the app renders — picks the right adapter for the source type. */
export function VideoPlayer({ source, playerRef, suppressed, onPlay, onPause, onSeek }: VideoPlayerProps) {
  if (source.type === "youtube") {
    return (
      <YouTubePlayerAdapter
        ref={playerRef}
        videoId={source.videoId}
        suppressed={suppressed}
        onPlay={onPlay}
        onPause={onPause}
        onSeek={onSeek}
      />
    );
  }

  return (
    <Html5PlayerAdapter
      ref={playerRef}
      source={source}
      suppressed={suppressed}
      onPlay={onPlay}
      onPause={onPause}
      onSeek={onSeek}
    />
  );
}
