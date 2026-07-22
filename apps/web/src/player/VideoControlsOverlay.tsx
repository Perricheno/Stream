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

function VolumeUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function VolumeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v1.79l2.48 2.48c.01-.08.02-.16.02-.24zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.44 8.44 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.14v2.06a8.99 8.99 0 0 0 3.69-1.86L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
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
  const [isMuted, setIsMuted] = useState(false);
  const lastVolumeRef = useRef(1);
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

  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (isMuted) {
      player.setVolume(lastVolumeRef.current || 1);
      setIsMuted(false);
    } else {
      lastVolumeRef.current = player.getVolume() || 1;
      player.setVolume(0);
      setIsMuted(true);
    }
    showControls();
  }, [playerRef, isMuted, showControls]);

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
          <button
            type="button"
            className={styles.iconButton}
            onClick={toggleMute}
            aria-label={isMuted ? "Включить звук" : "Выключить звук"}
          >
            {isMuted ? <VolumeOffIcon /> : <VolumeUpIcon />}
          </button>
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
