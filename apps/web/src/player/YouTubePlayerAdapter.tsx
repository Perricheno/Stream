import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import YouTube from "youtube-video-element/react";
import type YouTubeVideoElement from "youtube-video-element";
import type { PlayerAdapterEvents, PlayerHandle } from "./playerTypes";
import styles from "./VideoPlayer.module.css";

interface YouTubePlayerAdapterProps extends PlayerAdapterEvents {
  videoId: string;
  suppressed: React.MutableRefObject<boolean>;
}

/**
 * Built on `youtube-video-element` (Mux's media-elements project) instead of
 * hand-rolling against the raw YouTube IFrame API — that API's own object
 * exists synchronously but stays a silent no-op until a postMessage
 * handshake completes, which caused two real bugs earlier (autoplay and a
 * new joiner's initial sync both silently no-opping before that handshake
 * finished). This wraps the same IFrame API internally but exposes a real
 * `HTMLVideoElement`-compatible element instead — method calls made before
 * the video is loaded queue/no-op the same safe way a plain <video> tag's
 * do, and play/pause/seek/buffering are real dispatched DOM events instead
 * of something we had to poll for ourselves.
 */
export const YouTubePlayerAdapter = forwardRef<PlayerHandle, YouTubePlayerAdapterProps>(
  function YouTubePlayerAdapter({ videoId, suppressed, onPlay, onPause, onSeek, onEnded, onBuffering }, ref) {
    const elRef = useRef<YouTubeVideoElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        // Same as the plain <video> adapter — this element extends
        // HTMLVideoElement and handles calls made before load the same safe
        // way, no postMessage handshake to wait for from the outside.
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
        // YouTube's IFrame API rounds to its own fixed set of rates —
        // see playerTypes.ts's doc comment on this method.
        supportsFinePlaybackRate: () => false,
      }),
      [],
    );

    useEffect(() => {
      const el = elRef.current;
      if (!el) return;

      // Each handler checks a suppression deadline instead of a plain flag —
      // this element queues play()/pause()/currentTime until its iframe
      // finishes loading, which can take several seconds and doesn't
      // reliably produce just one confirming event, so a boolean (or count)
      // cleared "next frame"/"next event" would already be gone long before
      // the real confirmation shows up. See suppressed's doc comment.
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
      <YouTube
        ref={elRef}
        className={styles.fill}
        playsInline
        // Start buffering the moment a source is picked instead of waiting
        // for a play() call — the default ("metadata") only fetches enough
        // to report duration/thumbnail, leaving actual playback to start
        // fetching from zero right when speed matters most.
        preload="auto"
        // Privacy-enhanced mode — YouTube won't set tracking cookies until
        // the viewer actually presses play. modestbranding/controls=0 are
        // this element's own defaults (see its README), not set here.
        src={`https://www.youtube-nocookie.com/watch?v=${videoId}`}
        config={{
          cc_load_policy: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          rel: 0,
          origin: window.location.origin,
        }}
      />
    );
  },
);
