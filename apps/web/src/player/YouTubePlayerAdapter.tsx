import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { loadYouTubeIframeApi } from "./loadYouTubeIframeApi";
import type { PlayerAdapterEvents, PlayerHandle } from "./playerTypes";
import styles from "./VideoPlayer.module.css";

interface YouTubePlayerAdapterProps extends PlayerAdapterEvents {
  videoId: string;
  suppressed: React.MutableRefObject<boolean>;
}

let instanceCounter = 0;

export const YouTubePlayerAdapter = forwardRef<PlayerHandle, YouTubePlayerAdapterProps>(
  function YouTubePlayerAdapter({ videoId, suppressed, onPlay, onPause, onSeek }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YT.Player | null>(null);
    const elementId = useRef(`yt-player-${++instanceCounter}`);
    const lastKnownTime = useRef(0);

    useImperativeHandle(
      ref,
      () => ({
        play: () => playerRef.current?.playVideo(),
        pause: () => playerRef.current?.pauseVideo(),
        seekTo: (seconds) => playerRef.current?.seekTo(seconds, true),
        getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
        getDuration: () => playerRef.current?.getDuration() ?? 0,
        isPaused: () => playerRef.current?.getPlayerState() !== window.YT?.PlayerState.PLAYING,
      }),
      [],
    );

    useEffect(() => {
      let cancelled = false;
      let pollTimer: ReturnType<typeof setInterval> | undefined;

      loadYouTubeIframeApi().then((YT) => {
        if (cancelled || !containerRef.current) return;

        playerRef.current = new YT.Player(elementId.current, {
          videoId,
          width: "100%",
          height: "100%",
          // Strip YouTube's own chrome — we render our own minimal overlay
          // (VideoControlsOverlay.tsx) instead.
          playerVars: {
            autoplay: 0,
            cc_load_policy: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onStateChange: (event) => {
              const atSeconds = event.target.getCurrentTime();
              if (suppressed.current) return;
              if (event.data === YT.PlayerState.PLAYING) onPlay(atSeconds);
              else if (event.data === YT.PlayerState.PAUSED) onPause(atSeconds);
            },
          },
        });

        // The IFrame API has no seek event, so detect user scrubs by polling
        // for jumps in current time while playing.
        pollTimer = setInterval(() => {
          const player = playerRef.current;
          if (!player || suppressed.current) return;
          const current = player.getCurrentTime();
          if (Math.abs(current - lastKnownTime.current) > 1.5) onSeek(current);
          lastKnownTime.current = current;
        }, 1000);
      });

      return () => {
        cancelled = true;
        if (pollTimer) clearInterval(pollTimer);
        playerRef.current?.destroy();
        playerRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoId]);

    return <div className={styles.fill} ref={containerRef} id={elementId.current} />;
  },
);
