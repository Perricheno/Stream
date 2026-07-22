import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { IconButton } from "@telegram-apps/telegram-ui";
import { StickerPlayer } from "../../stickers/StickerPlayer";
import type { StickerId } from "../../stickers/stickers.manifest";
import type { RoomSocket } from "../../socket/socketClient";
import { useHapticFeedback } from "../../telegram/useHapticFeedback";
import styles from "./ReactionsOverlay.module.css";

const REACTIONS: StickerId[] = ["happy", "sad", "incognito", "cleaning"];

interface FloatingReaction {
  key: number;
  stickerId: StickerId;
  offset: number;
}

interface ReactionsOverlayProps {
  socket: RoomSocket;
}

let nextKey = 0;

export function ReactionsOverlay({ socket }: ReactionsOverlayProps) {
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const haptics = useHapticFeedback();

  useEffect(() => {
    const handleReaction = (payload: { stickerId: string }) => {
      if (!REACTIONS.includes(payload.stickerId as StickerId)) return;
      const key = nextKey++;
      const stickerId = payload.stickerId as StickerId;
      setFloating((prev) => [...prev, { key, stickerId, offset: Math.random() * 60 - 30 }]);
      setTimeout(() => {
        setFloating((prev) => prev.filter((reaction) => reaction.key !== key));
      }, 2000);
    };
    socket.on("reaction:broadcast", handleReaction);
    return () => {
      socket.off("reaction:broadcast", handleReaction);
    };
  }, [socket]);

  const sendReaction = useCallback(
    (stickerId: StickerId) => {
      haptics.impact("light");
      socket.emit("reaction:send", { stickerId });
    },
    [socket, haptics],
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.floatingLayer}>
        {floating.map((reaction) => (
          <div
            key={reaction.key}
            className={styles.floating}
            style={{ "--offset": `${reaction.offset}px` } as CSSProperties}
          >
            <StickerPlayer id={reaction.stickerId} size={56} />
          </div>
        ))}
      </div>
      <div className={styles.buttons}>
        {REACTIONS.map((id) => (
          <IconButton key={id} mode="plain" size="l" onClick={() => sendReaction(id)} aria-label={id}>
            <StickerPlayer id={id} size={32} loop autoplay />
          </IconButton>
        ))}
      </div>
    </div>
  );
}
