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
  function Html5PlayerAdapter({ source, suppressed, onPlay, onPause, onSeek }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        play: () => void videoRef.current?.play(),
        pause: () => videoRef.current?.pause(),
        seekTo: (seconds) => {
          if (videoRef.current) videoRef.current.currentTime = seconds;
        },
        getCurrentTime: () => videoRef.current?.currentTime ?? 0,
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

      video.addEventListener("play", handlePlay);
      video.addEventListener("pause", handlePause);
      video.addEventListener("seeked", handleSeeked);
      return () => {
        video.removeEventListener("play", handlePlay);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("seeked", handleSeeked);
      };
    }, [onPlay, onPause, onSeek, suppressed]);

    return <video ref={videoRef} playsInline controls className={styles.video} />;
  },
);
