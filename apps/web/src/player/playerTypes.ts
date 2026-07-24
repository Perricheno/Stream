export interface PlayerHandle {
  /** True once the player can actually act on play/pause/seekTo/etc. — for
   *  YouTube specifically, the imperative handle object exists (and its
   *  methods are callable without throwing) well before the iframe's
   *  postMessage handshake finishes, but those calls are silent no-ops
   *  until then. Sync logic that needs to know a call actually took effect
   *  (rather than just not crashing) checks this instead of only whether
   *  the ref itself is attached. */
  isReady(): boolean;
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
  /** Quality selection — only implemented for YouTube (direct files just play whatever the URL points to). */
  getQualities?(): string[];
  getQuality?(): string;
  setQuality?(quality: string): void;
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
