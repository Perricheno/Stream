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
  function YouTubePlayerAdapter({ videoId, suppressed, onPlay, onPause, onSeek, onEnded, onBuffering }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YT.Player | null>(null);
    const elementId = useRef(`yt-player-${++instanceCounter}`);
    const lastKnownTime = useRef(0);
    // The IFrame API's Player object exists the instant `new YT.Player(...)`
    // returns, but its methods (getPlayerState, getCurrentTime, etc.) aren't
    // actually attached until the internal postMessage handshake with the
    // iframe completes — calling them before that throws "not a function".
    // Every handle method below must check this before touching playerRef.
    const isReadyRef = useRef(false);

    useImperativeHandle(
      ref,
      () => ({
        isReady: () => isReadyRef.current,
        play: () => {
          if (isReadyRef.current) playerRef.current?.playVideo();
        },
        pause: () => {
          if (isReadyRef.current) playerRef.current?.pauseVideo();
        },
        seekTo: (seconds) => {
          if (isReadyRef.current) playerRef.current?.seekTo(seconds, true);
        },
        getCurrentTime: () => (isReadyRef.current ? playerRef.current?.getCurrentTime() ?? 0 : 0),
        getDuration: () => (isReadyRef.current ? playerRef.current?.getDuration() ?? 0 : 0),
        isPaused: () => (isReadyRef.current ? playerRef.current?.getPlayerState() !== window.YT?.PlayerState?.PLAYING : true),
        getVolume: () => (isReadyRef.current && playerRef.current ? playerRef.current.getVolume() / 100 : 1),
        setVolume: (volume) => {
          if (isReadyRef.current) playerRef.current?.setVolume(Math.round(Math.min(1, Math.max(0, volume)) * 100));
        },
        getPlaybackRate: () => (isReadyRef.current ? playerRef.current?.getPlaybackRate() ?? 1 : 1),
        setPlaybackRate: (rate) => {
          if (isReadyRef.current) playerRef.current?.setPlaybackRate(rate);
        },
        getQualities: () => (isReadyRef.current ? playerRef.current?.getAvailableQualityLevels() ?? [] : []),
        getQuality: () => (isReadyRef.current ? playerRef.current?.getPlaybackQuality() ?? "auto" : "auto"),
        setQuality: (quality) => {
          if (isReadyRef.current) playerRef.current?.setPlaybackQuality(quality);
        },
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
          // Privacy-enhanced mode — YouTube won't set tracking cookies until
          // the viewer actually presses play.
          host: "https://www.youtube-nocookie.com",
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
            onReady: () => {
              isReadyRef.current = true;
            },
            onStateChange: (event) => {
              // Reported regardless of `suppressed` — a stall is real player
              // state the sync layer needs to know about even when it was
              // our own programmatic seek that triggered it.
              if (event.data === YT.PlayerState.BUFFERING) onBuffering(true);
              else if (event.data === YT.PlayerState.PLAYING) onBuffering(false);

              if (suppressed.current) return;
              const atSeconds = event.target.getCurrentTime();
              if (event.data === YT.PlayerState.PLAYING) onPlay(atSeconds);
              else if (event.data === YT.PlayerState.PAUSED) onPause(atSeconds);
              else if (event.data === YT.PlayerState.ENDED) onEnded();
            },
          },
        });

        // The IFrame API has no seek event, so detect user scrubs by polling
        // for jumps in current time while playing.
        pollTimer = setInterval(() => {
          const player = playerRef.current;
          if (!player || !isReadyRef.current || suppressed.current) return;
          const current = player.getCurrentTime();
          if (Math.abs(current - lastKnownTime.current) > 1.5) onSeek(current);
          lastKnownTime.current = current;
        }, 1000);
      });

      return () => {
        cancelled = true;
        isReadyRef.current = false;
        if (pollTimer) clearInterval(pollTimer);
        playerRef.current?.destroy();
        playerRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoId]);

    return <div className={styles.fill} ref={containerRef} id={elementId.current} />;
  },
);
