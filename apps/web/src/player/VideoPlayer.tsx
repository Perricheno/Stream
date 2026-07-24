import { useEffect, useState, type RefObject } from "react";
import type { VideoSource } from "@stream/shared";
import { Html5PlayerAdapter } from "./Html5PlayerAdapter";
import { YouTubePlayerAdapter } from "./YouTubePlayerAdapter";
import { VimeoPlayerAdapter } from "./VimeoPlayerAdapter";
import { IframePlayerAdapter } from "./IframePlayerAdapter";
import { usePlayerProgress } from "./usePlayerProgress";
import { VideoControlsOverlay } from "./VideoControlsOverlay";
import { useTranslation } from "../i18n/useTranslation";
import type { PlayerAdapterEvents, PlayerHandle } from "./playerTypes";
import styles from "./VideoPlayer.module.css";

interface VideoPlayerProps extends PlayerAdapterEvents {
  source: VideoSource;
  suppressed: React.MutableRefObject<boolean>;
  playerRef: RefObject<PlayerHandle>;
  /** Only the host's play/pause/seek/skip actually move the shared state (see
   *  registerSocketHandlers.ts) — a non-host's tap would otherwise optimistically
   *  pause/seek their OWN player locally with nothing to correct it back until
   *  the next unrelated sync event happens to arrive. */
  isHost: boolean;
  /** Our own CSS-only "fullscreen" (expand to fill the viewport) is toggled
   *  internally, but RoomScreen needs to know when it's active to offer a
   *  chat-sidebar toggle over it — there's no room left for the normally
   *  docked-under-video chat once the video covers the whole screen. */
  onFullscreenChange?: (isFullscreen: boolean) => void;
  /** True while the fullscreen chat side panel is open — shrinks and shifts
   *  the video to make room for it instead of the panel simply floating on
   *  top, so the video stays fully visible instead of partly covered. */
  shrinkForChat?: boolean;
}

/** Single entry point the app renders — picks the right adapter, and owns the
 * aspect-ratio container plus the custom minimal controls overlay. */
export function VideoPlayer({
  source,
  playerRef,
  suppressed,
  onPlay,
  onPause,
  onSeek,
  onEnded,
  onBuffering,
  isHost,
  onFullscreenChange,
  shrinkForChat,
}: VideoPlayerProps) {
  const { t } = useTranslation();
  const progress = usePlayerProgress(playerRef);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const events = { onPlay, onPause, onSeek, onEnded, onBuffering };

  // Notified as an effect, not from inside the setIsFullscreen updater —
  // calling the parent's setState synchronously during this component's own
  // state update is exactly the "setState while rendering a different
  // component" pattern React warns about (and can drop the parent's update
  // in concurrent rendering).
  useEffect(() => {
    onFullscreenChange?.(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  const toggleFullscreen = () => setIsFullscreen((prev) => !prev);

  return (
    <div
      className={`${styles.container} ${isFullscreen ? styles.fullscreen : ""}`}
      data-chat-open={isFullscreen && shrinkForChat ? "true" : undefined}
    >
      {source.type === "youtube" ? (
        <YouTubePlayerAdapter ref={playerRef} videoId={source.videoId} suppressed={suppressed} {...events} />
      ) : source.type === "vimeo" ? (
        <VimeoPlayerAdapter ref={playerRef} videoId={source.videoId} suppressed={suppressed} {...events} />
      ) : source.type === "iframe" ? (
        <IframePlayerAdapter ref={playerRef} url={source.url} {...events} />
      ) : (
        <Html5PlayerAdapter ref={playerRef} source={source} suppressed={suppressed} {...events} />
      )}
      {source.type === "iframe" ? (
        <>
          <span className={styles.sourceNote}>{t("iframeSourceNote")}</span>
          <button
            type="button"
            className={styles.iframeToggle}
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? t("exitFullscreen") : t("enterFullscreen")}
          >
            {isFullscreen ? "⤡" : "⤢"}
          </button>
        </>
      ) : (
        <VideoControlsOverlay
          playerRef={playerRef}
          progress={progress}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          isHost={isHost}
        />
      )}
    </div>
  );
}
