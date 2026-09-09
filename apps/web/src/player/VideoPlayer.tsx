import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { VideoSource } from "@stream/shared";
import { Html5PlayerAdapter } from "./Html5PlayerAdapter";
import { YouTubePlayerAdapter } from "./YouTubePlayerAdapter";
import { VimeoPlayerAdapter } from "./VimeoPlayerAdapter";
import { useLibraryVideo } from "./useLibraryVideo";
import { useDocumentPictureInPicture } from "./useDocumentPictureInPicture";
import { usePlayerMediaSession } from "./usePlayerMediaSession";
import { usePlayerProgress } from "./usePlayerProgress";
import { VideoControlsOverlay } from "./VideoControlsOverlay";
import { useTranslation } from "../i18n/useTranslation";
import type { PlayerAdapterEvents, PlayerHandle } from "./playerTypes";
import styles from "./VideoPlayer.module.css";

interface VideoPlayerProps extends Omit<PlayerAdapterEvents, "onPlayBlocked" | "onError"> {
  source: VideoSource;
  suppressed: React.MutableRefObject<number>;
  playerRef: RefObject<PlayerHandle>;
  /** True when this browser's autoplay policy refused to start the video —
   *  shows a full-cover "tap to watch" layer. From useSyncedPlayback. */
  playBlocked: boolean;
  /** The adapter caught a NotAllowedError — raise the gate. */
  onPlayBlocked: () => void;
  /** The "tap to watch" layer was clicked — retry play() inside the gesture. */
  onRetryPlay: () => void;
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
  playBlocked,
  onPlayBlocked,
  onRetryPlay,
  onFullscreenChange,
  shrinkForChat,
}: VideoPlayerProps) {
  const { t } = useTranslation();
  const progress = usePlayerProgress(playerRef);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  // Defaults to 16:9 until the source reports its real dimensions (see
  // onDimensions on PlayerAdapterEvents) — otherwise a vertical phone
  // recording or any non-16:9 file gets forced into a 16:9 box and looks
  // squashed/stretched instead of correctly letterboxed.
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  // A `library` video isn't playable until its import job finishes — this
  // polls the job and, once ready, hands back a `file` source pointing at
  // the signed stream URL. No-ops for every other source type.
  const library = useLibraryVideo(source.type === "library" ? source.videoId : "");

  const handleError = (code: number, message: string) => {
    // 2 = network, 4 = src not supported — both are what a 401/403 body (an
    // expired stream token) looks like to <video>. For a library source, ask
    // for a fresh token and reload in place, keeping position (§2.7).
    if (source.type === "library" && (code === 2 || code === 4)) {
      setStreamError(null);
      library.remint();
      return;
    }
    setStreamError(message ? `${t("streamError")}: ${message}` : t("streamError"));
  };
  // A successful reload clears any lingering error note.
  useEffect(() => {
    if (progress.isPlaying) setStreamError(null);
  }, [progress.isPlaying]);

  // A fresh source's dimensions haven't been reported yet — fall back to
  // 16:9 again rather than keeping the previous video's ratio on screen.
  const sourceKey = source.type === "library" ? source.videoId : source.type === "file" ? source.url : source.type;
  useEffect(() => {
    setAspectRatio(null);
  }, [sourceKey]);

  const events = {
    onPlay,
    onPause,
    onSeek,
    onEnded,
    onBuffering,
    onPlayBlocked,
    onError: handleError,
    onDimensions: (width: number, height: number) => setAspectRatio(width / height),
  };
  const html5Source: Extract<VideoSource, { type: "file" }> | undefined =
    source.type === "file" ? source : source.type === "library" ? library.fileSource : undefined;
  const hasPlayer = source.type === "youtube" || source.type === "vimeo" || html5Source !== undefined;

  // Document PiP floats the whole container (any source type, including
  // YouTube/Vimeo's iframes) above every window — see its own doc comment
  // for why that needs a different mechanism than the standard <video>-only
  // requestPictureInPicture() the controls overlay also knows how to use.
  const documentPip = useDocumentPictureInPicture();

  // YouTube/Vimeo's own iframe already manages MediaSession internally once
  // playing — only the HTML5 (direct file/HLS/library) adapter has a real
  // <video> element with nothing already driving this for it.
  usePlayerMediaSession({ enabled: html5Source !== undefined, playerRef, title: "Stream" });

  // Notified as an effect, not from inside the setIsFullscreen updater —
  // calling the parent's setState synchronously during this component's own
  // state update is exactly the "setState while rendering a different
  // component" pattern React warns about (and can drop the parent's update
  // in concurrent rendering).
  useEffect(() => {
    onFullscreenChange?.(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  const toggleFullscreen = () => setIsFullscreen((prev) => !prev);

  const libraryNote =
    source.type === "library" && !html5Source
      ? library.status === "failed"
        ? library.errorMessage
          ? `${t("libraryFailed")}: ${library.errorMessage}`
          : t("libraryFailed")
        : library.status === "downloading"
          ? t("libraryDownloading").replace("{percent}", String(Math.round(library.progressPercent)))
          : t("libraryPreparing")
      : null;

  const containerNode = (
    <div
      className={`${styles.container} ${isFullscreen ? styles.fullscreen : ""}`}
      data-chat-open={isFullscreen && shrinkForChat ? "true" : undefined}
      // Fullscreen's own CSS class already sets aspect-ratio: unset to fill
      // the viewport — an inline style here would win over that and break
      // it, so only apply the real ratio outside fullscreen.
      style={!isFullscreen && aspectRatio ? { aspectRatio: String(aspectRatio) } : undefined}
    >
      {source.type === "youtube" ? (
        <YouTubePlayerAdapter ref={playerRef} videoId={source.videoId} suppressed={suppressed} {...events} />
      ) : source.type === "vimeo" ? (
        <VimeoPlayerAdapter ref={playerRef} videoId={source.videoId} suppressed={suppressed} {...events} />
      ) : html5Source ? (
        <Html5PlayerAdapter ref={playerRef} source={html5Source} suppressed={suppressed} {...events} />
      ) : (
        <div className={`${styles.fill} ${styles.libraryStatus}`}>
          <span>{libraryNote}</span>
        </div>
      )}
      {hasPlayer && (
        <VideoControlsOverlay
          playerRef={playerRef}
          progress={progress}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          documentPipSupported={documentPip.supported}
          onToggleDocumentPip={documentPip.toggle}
        />
      )}

      {hasPlayer && playBlocked && (
        <button type="button" className={styles.playGate} onClick={onRetryPlay}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
          <span>{t("tapToWatch")}</span>
        </button>
      )}

      {streamError && <span className={styles.sourceNote}>{streamError}</span>}
    </div>
  );

  if (documentPip.isActive && documentPip.pipWindow) {
    return (
      <>
        <div className={styles.pipPlaceholder}>
          <span>{t("pipFloatingNotice")}</span>
          <button type="button" className={styles.pipReturnButton} onClick={documentPip.toggle}>
            {t("pipReturn")}
          </button>
        </div>
        {createPortal(containerNode, documentPip.pipWindow.document.body)}
      </>
    );
  }

  return containerNode;
}
