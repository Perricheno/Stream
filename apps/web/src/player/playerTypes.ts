export interface PlayerHandle {
  /** True once the player can actually act on play/pause/seekTo/etc. Every
   *  adapter (plain <video>, and the YouTube/Vimeo custom elements, which
   *  both extend HTMLVideoElement) handles calls made before load the same
   *  safe way a native <video> tag does, so this is really just "is the ref
   *  attached" — kept as its own method so sync logic doesn't need to know
   *  that detail, and so it stays a real check again if a future adapter
   *  ever needs one. */
  isReady(): boolean;
  /** True once the player has actually loaded enough to report a real
   *  position and be meaningfully corrected — unlike isReady(), which is
   *  just "the ref is attached". youtube-video-element/vimeo-video-element
   *  queue play()/pause()/currentTime writes until their iframe finishes a
   *  multi-second load handshake, silently no-opping in the meantime and
   *  reporting getCurrentTime()===0 the whole time regardless of what's
   *  queued — drift correction needs to know the difference between "really
   *  0 seconds behind" and "hasn't loaded yet so this reading is
   *  meaningless", otherwise it repeatedly seeks a not-yet-loaded player
   *  toward a growing target, queuing conflicting commands that fight each
   *  other the moment it finally does load. */
  hasLoadedMetadata(): boolean;
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
  /** Whether setPlaybackRate() actually honors arbitrary values. A native
   *  <video> element (and Vimeo's player.js SDK) applies any rate exactly as
   *  given, but YouTube's IFrame API silently rounds suggestedRate to its own
   *  small fixed set (0.25/0.5/0.75/1/1.25/1.5/1.75/2) — a subtle nudge like
   *  1.03 gets rounded straight back to 1 (a silent no-op), which is why
   *  drift correction can't use the same fine, near-imperceptible rate delta
   *  for every adapter. */
  supportsFinePlaybackRate(): boolean;
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
