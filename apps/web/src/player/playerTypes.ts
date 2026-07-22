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
}

export interface PlayerAdapterEvents {
  onPlay(atSeconds: number): void;
  onPause(atSeconds: number): void;
  onSeek(atSeconds: number): void;
}
