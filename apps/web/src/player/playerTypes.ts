export interface PlayerHandle {
  /** True once the player can actually act on play/pause/seekTo/etc. Every
   *  adapter (plain <video>, and the YouTube/Vimeo custom elements, which
   *  both extend HTMLVideoElement) handles calls made before load the same
   *  safe way a native <video> tag does, so this is really just "is the ref
   *  attached" — kept as its own method so sync logic doesn't need to know
   *  that detail, and so it stays a real check again if a future adapter
   *  ever needs one. */
  isReady(): boolean;
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  isPaused(): boolean;
  /** 0–1, normalized the same way across every adapter. */
  getVolume(): number;
  setVolume(volume: number): void;
  /** Native "play over everything" mode — only implemented for direct video files (not YouTube/Vimeo). */
  requestPictureInPicture?(): void;
  getPlaybackRate(): number;
  setPlaybackRate(rate: number): void;
}

export interface PlayerAdapterEvents {
  onPlay(atSeconds: number): void;
  onPause(atSeconds: number): void;
  onSeek(atSeconds: number): void;
  /** Fired once when playback reaches the end — drives queue auto-advance. */
  onEnded(): void;
  /** Genuine network/buffering stall, not a user or sync action — lets the
   *  sync layer back off drift correction instead of fighting the browser's
   *  own recovery (seeking a stalled player just restarts buffering at a new
   *  position). Fired unconditionally, including for stalls caused by our
   *  own programmatic seeks, since the buffering is real either way. */
  onBuffering(isBuffering: boolean): void;
}

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
