import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Vimeo from "vimeo-video-element/react";
import type VimeoVideoElement from "vimeo-video-element";
import type { PlayerAdapterEvents, PlayerHandle } from "./playerTypes";
import styles from "./VideoPlayer.module.css";

interface VimeoPlayerAdapterProps extends PlayerAdapterEvents {
  videoId: string;
  suppressed: React.MutableRefObject<boolean>;
}

/** Built on `vimeo-video-element` (Mux's media-elements project), which
 *  wraps `@vimeo/player` internally but exposes a real HTMLVideoElement-
 *  compatible element — same rationale as YouTubePlayerAdapter.tsx. */
export const VimeoPlayerAdapter = forwardRef<PlayerHandle, VimeoPlayerAdapterProps>(
  function VimeoPlayerAdapter({ videoId, suppressed, onPlay, onPause, onSeek, onEnded, onBuffering }, ref) {
    const elRef = useRef<VimeoVideoElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        isReady: () => elRef.current !== null,
        hasLoadedMetadata: () => (elRef.current?.readyState ?? 0) >= 1,
        play: () => void elRef.current?.play(),
        pause: () => elRef.current?.pause(),
        seekTo: (seconds) => {
          if (elRef.current) elRef.current.currentTime = seconds;
        },
        getCurrentTime: () => elRef.current?.currentTime ?? 0,
        getDuration: () => {
          const duration = elRef.current?.duration;
          return Number.isFinite(duration) ? (duration as number) : 0;
        },
        isPaused: () => elRef.current?.paused ?? true,
        getVolume: () => elRef.current?.volume ?? 1,
        setVolume: (volume) => {
          if (elRef.current) elRef.current.volume = Math.min(1, Math.max(0, volume));
        },
        getPlaybackRate: () => elRef.current?.playbackRate ?? 1,
        setPlaybackRate: (rate) => {
          if (elRef.current) elRef.current.playbackRate = rate;
        },
        // Vimeo's player.js SDK accepts any rate in [0.5, 2] as given.
        supportsFinePlaybackRate: () => true,
      }),
      [],
    );

    useEffect(() => {
      const el = elRef.current;
      if (!el) return;

      // Each handler checks a suppression deadline instead of a plain flag —
      // see suppressed's doc comment in useSyncedPlayback.ts.
      const handlePlay = () => {
        if (Date.now() >= suppressed.current) onPlay(el.currentTime);
      };
      const handlePause = () => {
        if (Date.now() >= suppressed.current) onPause(el.currentTime);
      };
      const handleSeeked = () => {
        if (Date.now() >= suppressed.current) onSeek(el.currentTime);
      };
      const handleEnded = () => onEnded();
      const handleWaiting = () => onBuffering(true);
      const handlePlaying = () => onBuffering(false);

      el.addEventListener("play", handlePlay);
      el.addEventListener("pause", handlePause);
      el.addEventListener("seeked", handleSeeked);
      el.addEventListener("ended", handleEnded);
      el.addEventListener("waiting", handleWaiting);
      el.addEventListener("playing", handlePlaying);
      return () => {
        el.removeEventListener("play", handlePlay);
        el.removeEventListener("pause", handlePause);
        el.removeEventListener("seeked", handleSeeked);
        el.removeEventListener("ended", handleEnded);
        el.removeEventListener("waiting", handleWaiting);
        el.removeEventListener("playing", handlePlaying);
      };
    }, [onPlay, onPause, onSeek, onEnded, onBuffering, suppressed]);

    return (
      <Vimeo
        ref={elRef}
        className={styles.fill}
        playsInline
        // See YouTubePlayerAdapter.tsx's identical comment — start buffering
        // as soon as a source is picked, not lazily on first play().
        preload="auto"
        src={`https://vimeo.com/${videoId}`}
        config={{ autopause: false, responsive: true }}
      />
    );
  },
);
