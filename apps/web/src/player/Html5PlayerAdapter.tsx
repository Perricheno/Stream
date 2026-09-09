import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Hls from "hls.js";
import type { VideoSource } from "@stream/shared";
import type { PlayerAdapterEvents, PlayerHandle } from "./playerTypes";
import styles from "./VideoPlayer.module.css";

interface Html5PlayerAdapterProps extends PlayerAdapterEvents {
  source: Extract<VideoSource, { type: "file" }>;
  suppressed: React.MutableRefObject<number>;
}

export const Html5PlayerAdapter = forwardRef<PlayerHandle, Html5PlayerAdapterProps>(
  function Html5PlayerAdapter(
    { source, suppressed, onPlay, onPause, onSeek, onEnded, onBuffering, onPlayBlocked, onError, onDimensions },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);
    // useImperativeHandle closes over [] — read callbacks through a ref so
    // play()'s rejection handler always calls the current onPlayBlocked.
    const cbRef = useRef({ onPlayBlocked });
    cbRef.current = { onPlayBlocked };

    useImperativeHandle(
      ref,
      () => ({
        // A <video> element's methods are always immediately callable, no
        // handshake to wait for — ready the instant it's mounted.
        isReady: () => videoRef.current !== null,
        hasLoadedMetadata: () => (videoRef.current?.readyState ?? 0) >= 1,
        play: () => {
          const p = videoRef.current?.play();
          if (!p) return Promise.resolve();
          return p.catch((err: unknown) => {
            if (err instanceof DOMException && err.name === "NotAllowedError") cbRef.current.onPlayBlocked();
            throw err;
          });
        },
        pause: () => videoRef.current?.pause(),
        seekTo: (seconds) => {
          if (videoRef.current) videoRef.current.currentTime = seconds;
        },
        getCurrentTime: () => videoRef.current?.currentTime ?? 0,
        getDuration: () => {
          const duration = videoRef.current?.duration;
          return Number.isFinite(duration) ? (duration as number) : 0;
        },
        isPaused: () => videoRef.current?.paused ?? true,
        getVolume: () => videoRef.current?.volume ?? 1,
        setVolume: (volume) => {
          if (videoRef.current) videoRef.current.volume = Math.min(1, Math.max(0, volume));
        },
        requestPictureInPicture: () => {
          void videoRef.current?.requestPictureInPicture?.();
        },
        getPlaybackRate: () => videoRef.current?.playbackRate ?? 1,
        setPlaybackRate: (rate) => {
          if (videoRef.current) videoRef.current.playbackRate = rate;
        },
        supportsFinePlaybackRate: () => true,
      }),
      [],
    );

    // Remember the path (without the query string) so that a URL change which
    // is only a fresh `?token=` — i.e. useLibraryVideo re-minting an expired
    // stream token, see §2.7 — reloads the same file and resumes where it
    // was, rather than restarting from 0 like a genuinely new source would.
    const lastPathRef = useRef<string | null>(null);
    const resumeAtRef = useRef(0);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const path = source.url.split("?")[0];
      if (lastPathRef.current === path && video.currentTime > 0) {
        resumeAtRef.current = video.currentTime;
      }
      lastPathRef.current = path;

      if (source.kind === "hls" && Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(source.url);
        hls.attachMedia(video);
        return () => hls.destroy();
      }

      video.src = source.url;
      return undefined;
    }, [source.url, source.kind]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      // Each handler checks a suppression deadline instead of a plain flag —
      // see suppressed's doc comment in useSyncedPlayback.ts.
      const handlePlay = () => {
        if (Date.now() >= suppressed.current) onPlay(video.currentTime);
      };
      const handlePause = () => {
        if (Date.now() >= suppressed.current) onPause(video.currentTime);
      };
      const handleSeeked = () => {
        if (Date.now() >= suppressed.current) onSeek(video.currentTime);
      };
      const handleEnded = () => onEnded();
      // "waiting"/"playing" is the spec pair for stall start/end — "playing"
      // fires whenever playback (re)starts, including right after a wait,
      // unlike "canplay" which can fire without actually resuming.
      const handleWaiting = () => onBuffering(true);
      const handlePlaying = () => onBuffering(false);
      const handleLoadedMetadata = () => {
        if (resumeAtRef.current > 0) {
          video.currentTime = resumeAtRef.current;
          resumeAtRef.current = 0;
        }
        if (video.videoWidth > 0 && video.videoHeight > 0) onDimensions?.(video.videoWidth, video.videoHeight);
      };
      const handleError = () => {
        const err = video.error;
        if (err) onError(err.code, err.message || "");
      };

      video.addEventListener("play", handlePlay);
      video.addEventListener("pause", handlePause);
      video.addEventListener("seeked", handleSeeked);
      video.addEventListener("ended", handleEnded);
      video.addEventListener("waiting", handleWaiting);
      video.addEventListener("playing", handlePlaying);
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("error", handleError);
      return () => {
        video.removeEventListener("play", handlePlay);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("seeked", handleSeeked);
        video.removeEventListener("ended", handleEnded);
        video.removeEventListener("waiting", handleWaiting);
        video.removeEventListener("playing", handlePlaying);
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("error", handleError);
      };
    }, [onPlay, onPause, onSeek, onEnded, onBuffering, onError, onDimensions, suppressed]);

    return <video ref={videoRef} playsInline className={styles.fill} />;
  },
);
