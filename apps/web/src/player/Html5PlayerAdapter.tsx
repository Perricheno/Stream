import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Hls from "hls.js";
import type { VideoSource } from "@stream/shared";
import type { PlayerAdapterEvents, PlayerHandle } from "./playerTypes";
import styles from "./VideoPlayer.module.css";

interface Html5PlayerAdapterProps extends PlayerAdapterEvents {
  source: Extract<VideoSource, { type: "file" }>;
  suppressed: React.MutableRefObject<boolean>;
}

export const Html5PlayerAdapter = forwardRef<PlayerHandle, Html5PlayerAdapterProps>(
  function Html5PlayerAdapter({ source, suppressed, onPlay, onPause, onSeek, onEnded, onBuffering }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        // A <video> element's methods are always immediately callable, no
        // handshake to wait for — ready the instant it's mounted.
        isReady: () => videoRef.current !== null,
        play: () => void videoRef.current?.play(),
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
      }),
      [],
    );

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

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

      const handlePlay = () => {
        if (!suppressed.current) onPlay(video.currentTime);
      };
      const handlePause = () => {
        if (!suppressed.current) onPause(video.currentTime);
      };
      const handleSeeked = () => {
        if (!suppressed.current) onSeek(video.currentTime);
      };
      const handleEnded = () => onEnded();
      // "waiting"/"playing" is the spec pair for stall start/end — "playing"
      // fires whenever playback (re)starts, including right after a wait,
      // unlike "canplay" which can fire without actually resuming.
      const handleWaiting = () => onBuffering(true);
      const handlePlaying = () => onBuffering(false);

      video.addEventListener("play", handlePlay);
      video.addEventListener("pause", handlePause);
      video.addEventListener("seeked", handleSeeked);
      video.addEventListener("ended", handleEnded);
      video.addEventListener("waiting", handleWaiting);
      video.addEventListener("playing", handlePlaying);
      return () => {
        video.removeEventListener("play", handlePlay);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("seeked", handleSeeked);
        video.removeEventListener("ended", handleEnded);
        video.removeEventListener("waiting", handleWaiting);
        video.removeEventListener("playing", handlePlaying);
      };
    }, [onPlay, onPause, onSeek, onEnded, onBuffering, suppressed]);

    return <video ref={videoRef} playsInline className={styles.fill} />;
  },
);
