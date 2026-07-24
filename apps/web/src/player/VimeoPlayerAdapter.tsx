import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Player from "@vimeo/player";
import type { PlayerAdapterEvents, PlayerHandle } from "./playerTypes";
import styles from "./VideoPlayer.module.css";

interface VimeoPlayerAdapterProps extends PlayerAdapterEvents {
  videoId: string;
  suppressed: React.MutableRefObject<boolean>;
}

/** @vimeo/player's API is Promise-based (postMessage under the hood), but
 *  PlayerHandle needs synchronous getters — so we mirror live state into a
 *  ref via player events and read from that, same pattern the HLS/YouTube
 *  adapters use for their own native APIs. */
export const VimeoPlayerAdapter = forwardRef<PlayerHandle, VimeoPlayerAdapterProps>(
  function VimeoPlayerAdapter({ videoId, suppressed, onPlay, onPause, onSeek, onEnded, onBuffering }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<Player | null>(null);
    const stateRef = useRef({ currentTime: 0, duration: 0, paused: true, volume: 1, rate: 1 });
    const isReadyRef = useRef(false);

    useImperativeHandle(
      ref,
      () => ({
        isReady: () => isReadyRef.current,
        play: () => void playerRef.current?.play(),
        pause: () => void playerRef.current?.pause(),
        seekTo: (seconds) => void playerRef.current?.setCurrentTime(seconds),
        getCurrentTime: () => stateRef.current.currentTime,
        getDuration: () => stateRef.current.duration,
        isPaused: () => stateRef.current.paused,
        getVolume: () => stateRef.current.volume,
        setVolume: (volume) => void playerRef.current?.setVolume(Math.min(1, Math.max(0, volume))),
        getPlaybackRate: () => stateRef.current.rate,
        setPlaybackRate: (rate) => void playerRef.current?.setPlaybackRate(rate),
      }),
      [],
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const player = new Player(container, {
        id: Number(videoId),
        responsive: true,
        controls: false,
        autopause: false,
      });
      playerRef.current = player;
      player.ready().then(() => {
        isReadyRef.current = true;
      });

      player
        .getDuration()
        .then((duration) => {
          stateRef.current.duration = duration;
        })
        .catch(() => {});

      const handlePlay = ({ seconds }: { seconds: number }) => {
        stateRef.current.paused = false;
        stateRef.current.currentTime = seconds;
        if (!suppressed.current) onPlay(seconds);
      };
      const handlePause = ({ seconds }: { seconds: number }) => {
        stateRef.current.paused = true;
        stateRef.current.currentTime = seconds;
        if (!suppressed.current) onPause(seconds);
      };
      const handleSeeked = ({ seconds }: { seconds: number }) => {
        stateRef.current.currentTime = seconds;
        if (!suppressed.current) onSeek(seconds);
      };
      const handleTimeupdate = ({ seconds, duration }: { seconds: number; duration: number }) => {
        stateRef.current.currentTime = seconds;
        stateRef.current.duration = duration;
      };
      const handleEnded = () => onEnded();
      const handleVolumeChange = ({ volume }: { volume: number }) => {
        stateRef.current.volume = volume;
      };
      const handleRateChange = ({ playbackRate }: { playbackRate: number }) => {
        stateRef.current.rate = playbackRate;
      };
      const handleBufferStart = () => onBuffering(true);
      const handleBufferEnd = () => onBuffering(false);

      player.on("play", handlePlay);
      player.on("pause", handlePause);
      player.on("seeked", handleSeeked);
      player.on("timeupdate", handleTimeupdate);
      player.on("ended", handleEnded);
      player.on("volumechange", handleVolumeChange);
      player.on("playbackratechange", handleRateChange);
      player.on("bufferstart", handleBufferStart);
      player.on("bufferend", handleBufferEnd);

      return () => {
        isReadyRef.current = false;
        playerRef.current = null;
        void player.destroy();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoId]);

    return <div className={styles.fill} ref={containerRef} />;
  },
);
