import { forwardRef, useImperativeHandle } from "react";
import type { PlayerAdapterEvents, PlayerHandle } from "./playerTypes";
import styles from "./VideoPlayer.module.css";

interface IframePlayerAdapterProps extends PlayerAdapterEvents {
  url: string;
}

/**
 * Last-resort fallback for pages that only expose an embeddable third-party
 * player, not a raw stream — so unlike the other adapters there's no control
 * protocol to hook into. play/pause/seek are inert and playback sync across
 * participants doesn't apply here (RoomScreen shows a note explaining that).
 *
 * Sandboxed without allow-popups/allow-top-navigation so the embed can't
 * spawn popup ads or hijack the page with a forced redirect — the most
 * disruptive ad behavior third-party embeds tend to carry.
 */
export const IframePlayerAdapter = forwardRef<PlayerHandle, IframePlayerAdapterProps>(
  function IframePlayerAdapter({ url }, ref) {
    useImperativeHandle(
      ref,
      () => ({
        // No control protocol exists for this adapter at all — every method
        // here is already an inert no-op, so there's no "not ready yet"
        // state to report.
        isReady: () => true,
        play: () => {},
        pause: () => {},
        seekTo: () => {},
        getCurrentTime: () => 0,
        getDuration: () => 0,
        isPaused: () => true,
        getVolume: () => 1,
        setVolume: () => {},
        getPlaybackRate: () => 1,
        setPlaybackRate: () => {},
      }),
      [],
    );

    return (
      <iframe
        className={styles.fill}
        src={url}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        title="video"
      />
    );
  },
);
