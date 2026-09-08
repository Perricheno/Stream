import { useEffect } from "react";
import type { RefObject } from "react";
import type { PlayerHandle } from "./playerTypes";

const SEEK_SKIP_SECONDS = 10;

interface UsePlayerMediaSessionOptions {
  /** Only the HTML5 (direct file/HLS) adapter has a real `<video>` element to
   *  drive this from — YouTube/Vimeo's own iframe already manages its own
   *  MediaSession internally once playing, and this must not fight that. */
  enabled: boolean;
  playerRef: RefObject<PlayerHandle>;
  title: string;
}

/**
 * Registers the room's video with `navigator.mediaSession` so OS-level media
 * controls (lock screen, hardware keys, the browser tab's own media
 * indicator) can see and drive it — the standards-based way to make
 * background/tab-switched playback feel like a first-class platform feature,
 * on top of (not instead of) the browser's own autoplay policy already
 * keeping an already-playing tab's video running when backgrounded.
 */
export function usePlayerMediaSession({ enabled, playerRef, title }: UsePlayerMediaSessionOptions): void {
  useEffect(() => {
    if (!enabled || !("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({ title });

    // Any participant may drive playback now (§2.3), and an OS media key /
    // lock-screen tap is a real user gesture, so wire them for everyone.
    navigator.mediaSession.setActionHandler("play", () => void playerRef.current?.play().catch(() => {}));
    navigator.mediaSession.setActionHandler("pause", () => playerRef.current?.pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      const player = playerRef.current;
      if (player) player.seekTo(Math.max(0, player.getCurrentTime() - SEEK_SKIP_SECONDS));
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
      const player = playerRef.current;
      if (player) player.seekTo(Math.min(player.getDuration() || Infinity, player.getCurrentTime() + SEEK_SKIP_SECONDS));
    });

    return () => {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
    };
  }, [enabled, playerRef, title]);
}
