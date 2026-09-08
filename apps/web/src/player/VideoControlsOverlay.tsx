import { useCallback, useEffect, useRef, useState } from "react";
import { PLAYBACK_SPEEDS, type PlayerHandle } from "./playerTypes";
import type { PlayerProgress } from "./usePlayerProgress";
import styles from "./VideoControlsOverlay.module.css";

function formatSpeed(rate: number): string {
  return `${rate}×`;
}

const AUTO_HIDE_MS = 2500;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_MAX_DIST_PX = 40;
const VOLUME_DRAG_THRESHOLD_PX = 12;
const VOLUME_DRAG_RANGE_PX = 240;

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

function SkipBackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.5 12 20 18V6zM4 6v12l8.5-6z" />
      <text x="12" y="21.5" fontSize="7" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">
        10
      </text>
    </svg>
  );
}

function SkipForwardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.5 12 4 18V6zM20 6v12l-8.5-6z" />
      <text x="12" y="21.5" fontSize="7" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">
        10
      </text>
    </svg>
  );
}

const SEEK_SKIP_SECONDS = 10;

interface VideoControlsOverlayProps {
  playerRef: React.RefObject<PlayerHandle>;
  progress: PlayerProgress;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  /** Document Picture-in-Picture (floats this whole overlay + player above
   *  every window, any source type) — preferred over the plain <video> PiP
   *  below when available. See useDocumentPictureInPicture.ts. */
  documentPipSupported?: boolean;
  onToggleDocumentPip?: () => void;
}

export function VideoControlsOverlay({
  playerRef,
  progress,
  isFullscreen,
  onToggleFullscreen,
  documentPipSupported,
  onToggleDocumentPip,
}: VideoControlsOverlayProps) {
  const [visible, setVisible] = useState(true);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(PLAYBACK_SPEEDS.indexOf(1));
  // Optimistic override for the play/pause icon: usePlayerProgress only
  // samples the player every 250ms, so without this, tapping play/pause
  // felt like it had a delay before the button visually caught up — even
  // though the video itself responded instantly (play()/pause() are called
  // directly on the native player, not through this state).
  const [optimisticPlaying, setOptimisticPlaying] = useState<boolean | null>(null);
  const isPlaying = optimisticPlaying ?? progress.isPlaying;
  const [volumeLevel, setVolumeLevel] = useState(1);
  const [volumeIndicatorVisible, setVolumeIndicatorVisible] = useState(false);
  const lastVolumeRef = useRef(1);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const volumeHideTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const gestureRef = useRef<{ startX: number; startY: number; startVolume: number; isDragging: boolean } | null>(null);

  useEffect(() => {
    if (optimisticPlaying !== null && progress.isPlaying === optimisticPlaying) {
      setOptimisticPlaying(null);
    }
  }, [progress.isPlaying, optimisticPlaying]);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (!isPlaying) return;
    hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
  }, [isPlaying]);

  const showControls = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (volumeHideTimer.current) clearTimeout(volumeHideTimer.current);
    };
  }, [scheduleHide]);

  // Single handler covers three things at once: revealing the controls on
  // any tap, detecting a double-tap (within DOUBLE_TAP_MS, close together)
  // to toggle fullscreen, and arming a possible vertical volume drag. Taps
  // that land on an actual button/input are excluded from the gesture so
  // they don't fight the seek bar or icon buttons — `.closest` is needed
  // (not `event.target === event.currentTarget`) because once the controls
  // are visible, `.controlsGroup` itself becomes the real tap target, not
  // just the root `.overlay`.
  const handleBackgroundPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      showControls();
      const target = event.target as HTMLElement;
      if (target.closest("button, input")) {
        gestureRef.current = null;
        return;
      }

      const x = event.clientX;
      const y = event.clientY;
      const now = Date.now();
      const lastTap = lastTapRef.current;
      const isDoubleTap =
        lastTap !== null &&
        now - lastTap.time < DOUBLE_TAP_MS &&
        Math.hypot(x - lastTap.x, y - lastTap.y) < DOUBLE_TAP_MAX_DIST_PX;

      if (isDoubleTap) {
        lastTapRef.current = null;
        gestureRef.current = null;
        onToggleFullscreen();
        showControls();
        return;
      }

      lastTapRef.current = { time: now, x, y };
      gestureRef.current = {
        startX: x,
        startY: y,
        startVolume: playerRef.current?.getVolume() ?? 1,
        isDragging: false,
      };
    },
    [showControls, playerRef, onToggleFullscreen],
  );

  const handleBackgroundPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const deltaY = gesture.startY - event.clientY;
      if (!gesture.isDragging) {
        if (Math.abs(deltaY) < VOLUME_DRAG_THRESHOLD_PX) return;
        gesture.isDragging = true;
      }
      const player = playerRef.current;
      if (!player) return;
      const nextVolume = Math.min(1, Math.max(0, gesture.startVolume + deltaY / VOLUME_DRAG_RANGE_PX));
      player.setVolume(nextVolume);
      if (nextVolume > 0) {
        lastVolumeRef.current = nextVolume;
        setIsMuted(false);
      } else {
        setIsMuted(true);
      }
      setVolumeLevel(nextVolume);
      setVolumeIndicatorVisible(true);
      if (volumeHideTimer.current) clearTimeout(volumeHideTimer.current);
    },
    [playerRef],
  );

  const handleBackgroundPointerUp = useCallback(() => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (gesture?.isDragging) {
      // A drag isn't a tap — don't let the next real tap pair up with this
      // one and misfire the double-tap-fullscreen gesture.
      lastTapRef.current = null;
      if (volumeHideTimer.current) clearTimeout(volumeHideTimer.current);
      volumeHideTimer.current = setTimeout(() => setVolumeIndicatorVisible(false), 700);
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isPaused()) {
      void player.play().catch(() => {
        // NotAllowedError → the adapter raises the "tap to watch" gate.
      });
      setOptimisticPlaying(true);
    } else {
      player.pause();
      setOptimisticPlaying(false);
    }
    showControls();
  }, [playerRef, showControls]);

  const skip = useCallback(
    (deltaSeconds: number) => {
      const player = playerRef.current;
      if (!player) return;
      const target = Math.min(Math.max(player.getCurrentTime() + deltaSeconds, 0), progress.duration || Infinity);
      player.seekTo(target);
      showControls();
    },
    [playerRef, progress.duration, showControls],
  );

  const handleFullscreenClick = useCallback(() => {
    onToggleFullscreen();
    showControls();
  }, [onToggleFullscreen, showControls]);

  const handlePipClick = useCallback(() => {
    if (documentPipSupported && onToggleDocumentPip) {
      onToggleDocumentPip();
    } else {
      playerRef.current?.requestPictureInPicture?.();
    }
    showControls();
  }, [documentPipSupported, onToggleDocumentPip, playerRef, showControls]);

  const cycleSpeed = useCallback(() => {
    const nextIndex = (speedIndex + 1) % PLAYBACK_SPEEDS.length;
    setSpeedIndex(nextIndex);
    playerRef.current?.setPlaybackRate(PLAYBACK_SPEEDS[nextIndex]);
    showControls();
  }, [speedIndex, playerRef, showControls]);

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
  const pipSupported = documentPipSupported || typeof playerRef.current?.requestPictureInPicture === "function";

  return (
    <div
      className={styles.overlay}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handleBackgroundPointerMove}
      onPointerUp={handleBackgroundPointerUp}
      onPointerLeave={handleBackgroundPointerUp}
    >
      <div className={styles.scrim} data-visible={visible} data-playing={isPlaying} />
      <div className={styles.volumeIndicator} data-visible={volumeIndicatorVisible}>
        {volumeLevel > 0 ? <VolumeUpIcon /> : <VolumeOffIcon />}
        <div className={styles.volumeTrack}>
          <div className={styles.volumeFill} style={{ height: `${Math.round(volumeLevel * 100)}%` }} />
        </div>
      </div>
      <div className={styles.controlsGroup} data-visible={visible}>
        <div className={styles.centerControls}>
          <button
            type="button"
            className={styles.skipButton}
            onClick={() => skip(-SEEK_SKIP_SECONDS)}
            aria-label="Назад на 10 секунд"
          >
            <SkipBackIcon />
          </button>
          <button type="button" className={styles.playButton} onClick={togglePlayPause} aria-label="Play/Pause">
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            type="button"
            className={styles.skipButton}
            onClick={() => skip(SEEK_SKIP_SECONDS)}
            aria-label="Вперёд на 10 секунд"
          >
            <SkipForwardIcon />
          </button>
        </div>
        <div className={styles.bottomBar}>
          <div className={styles.seekRow}>
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
          </div>
          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={toggleMute}
              aria-label={isMuted ? "Включить звук" : "Выключить звук"}
            >
              {isMuted ? <VolumeOffIcon /> : <VolumeUpIcon />}
            </button>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.speedButton}`}
              onClick={cycleSpeed}
              aria-label="Скорость воспроизведения"
            >
              {formatSpeed(PLAYBACK_SPEEDS[speedIndex])}
            </button>
            <span className={styles.actionSpacer} />
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
    </div>
  );
}
