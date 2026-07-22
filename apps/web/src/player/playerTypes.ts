export interface PlayerHandle {
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  isPaused(): boolean;
  /** 0–1, normalized the same way for both the HTML5 video element and the YouTube adapter. */
  getVolume(): number;
  setVolume(volume: number): void;
  /** Native "play over everything" mode — only implemented for direct video files (not YouTube). */
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
}

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
