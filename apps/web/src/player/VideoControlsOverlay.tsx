import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerHandle } from "./playerTypes";
import type { PlayerProgress } from "./usePlayerProgress";
import styles from "./VideoControlsOverlay.module.css";

const AUTO_HIDE_MS = 2500;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function PlayIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 9V4h5v2H6v3H4zm0 6h2v3h3v2H4v-5zm16-6h-2V6h-3V4h5v5zm-2 6h2v5h-5v-2h3v-3z" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 4H7v3H4v2h5V4zm6 0v5h5V7h-3V4h-2zM4 15v2h3v3h2v-5H4zm11 5h2v-3h3v-2h-5v5z" />
    </svg>
  );
}

function PipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 7H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zm0 12H5V9h14v10zM13 13h5v4h-5z" />
    </svg>
  );
}

interface VideoControlsOverlayProps {
  playerRef: React.RefObject<PlayerHandle>;
  progress: PlayerProgress;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export function VideoControlsOverlay({ playerRef, progress, isFullscreen, onToggleFullscreen }: VideoControlsOverlayProps) {
  const [visible, setVisible] = useState(true);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (!progress.isPlaying) return;
    hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
  }, [progress.isPlaying]);

  const showControls = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [scheduleHide]);

  const togglePlayPause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isPaused()) player.play();
    else player.pause();
    showControls();
  }, [playerRef, showControls]);

  const handleFullscreenClick = useCallback(() => {
    onToggleFullscreen();
    showControls();
  }, [onToggleFullscreen, showControls]);

  const handlePipClick = useCallback(() => {
    playerRef.current?.requestPictureInPicture?.();
    showControls();
  }, [playerRef, showControls]);

  const displayedTime = dragValue ?? progress.currentTime;
  const pipSupported = typeof playerRef.current?.requestPictureInPicture === "function";

  return (
    <div className={styles.overlay} onPointerDown={showControls}>
      <div className={styles.scrim} data-visible={visible} />
      <div className={styles.controlsGroup} data-visible={visible}>
        <button type="button" className={styles.playButton} onClick={togglePlayPause} aria-label="Play/Pause">
          {progress.isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className={styles.bottomBar}>
          <span className={styles.time}>{formatTime(displayedTime)}</span>
          <input
            type="range"
            className={styles.seekBar}
            min={0}
            max={progress.duration || 0}
            step={0.5}
            value={displayedTime}
            onChange={(event) => setDragValue(Number(event.target.value))}
            onPointerUp={(event) => {
              const value = Number((event.target as HTMLInputElement).value);
              playerRef.current?.seekTo(value);
              setDragValue(null);
              showControls();
            }}
          />
          <span className={styles.time}>{formatTime(progress.duration)}</span>
          {pipSupported && (
            <button type="button" className={styles.iconButton} onClick={handlePipClick} aria-label="Картинка в картинке">
              <PipIcon />
            </button>
          )}
          <button
            type="button"
            className={styles.iconButton}
            onClick={handleFullscreenClick}
            aria-label={isFullscreen ? "Свернуть" : "Развернуть"}
          >
            {isFullscreen ? <CollapseIcon /> : <ExpandIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}
