export interface PlayerHandle {
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  isPaused(): boolean;
}

export interface PlayerAdapterEvents {
  onPlay(atSeconds: number): void;
  onPause(atSeconds: number): void;
  onSeek(atSeconds: number): void;
}
