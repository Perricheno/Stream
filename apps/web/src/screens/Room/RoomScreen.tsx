import { useCallback, useEffect } from "react";
import { List, Placeholder, Section } from "@telegram-apps/telegram-ui";
import { shareURL } from "@telegram-apps/sdk-react";
import type { VideoSource } from "@stream/shared";
import { useBackButton } from "../../telegram/useBackButton";
import { useSecondaryButton } from "../../telegram/useMainButton";
import { useHapticFeedback } from "../../telegram/useHapticFeedback";
import { confirmAction } from "../../telegram/confirmAction";
import { useRoomSocket } from "../../socket/useRoomSocket";
import { socket } from "../../socket/socketClient";
import { useSyncedPlayback } from "../../player/useSyncedPlayback";
import { VideoPlayer } from "../../player/VideoPlayer";
import { StickerPlayer } from "../../stickers/StickerPlayer";
import { ParticipantsBar } from "./ParticipantsBar";
import { VideoSourcePicker } from "./VideoSourcePicker";
import { ReactionsOverlay } from "./ReactionsOverlay";

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME as string | undefined;

interface RoomScreenProps {
  roomId: string;
  onExit: () => void;
}

export function RoomScreen({ roomId, onExit }: RoomScreenProps) {
  const { status, room, error } = useRoomSocket(roomId);
  const haptics = useHapticFeedback();
  const synced = useSyncedPlayback(socket, room?.playback ?? null);

  const handleBack = useCallback(async () => {
    const confirmed = await confirmAction(
      "Просмотр продолжится для остальных участников.",
      "Покинуть комнату?",
    );
    if (confirmed) onExit();
  }, [onExit]);
  useBackButton(true, handleBack);

  const handleShare = useCallback(() => {
    if (!BOT_USERNAME) {
      haptics.notify("error");
      return;
    }
    shareURL(`https://t.me/${BOT_USERNAME}?startapp=room_${roomId}`, "Присоединяйся к просмотру!");
  }, [roomId, haptics]);
  useSecondaryButton({ text: "Поделиться комнатой", visible: status === "joined", onClick: handleShare });

  useEffect(() => {
    if (status === "joined") haptics.notify("success");
    if (status === "error") haptics.notify("error");
  }, [status, haptics]);

  const changeSource = useCallback((source: VideoSource) => {
    socket.emit("playback:change-source", { source });
  }, []);

  if (status === "idle" || status === "connecting") {
    return (
      <Placeholder header="Подключаемся..." description={`Комната ${roomId}`}>
        <StickerPlayer id="calling" size={120} />
      </Placeholder>
    );
  }

  if (status === "error" || !room) {
    return (
      <Placeholder header="Не получилось войти" description={error ?? "Попробуйте ещё раз"}>
        <StickerPlayer id="blocked" size={120} />
      </Placeholder>
    );
  }

  return (
    <List>
      <ParticipantsBar participants={room.participants} />

      <Section header={`Комната ${roomId}`}>
        {room.source ? (
          <div style={{ padding: 16 }}>
            <VideoPlayer
              source={room.source}
              playerRef={synced.playerRef}
              suppressed={synced.suppressed}
              onPlay={synced.onPlay}
              onPause={synced.onPause}
              onSeek={synced.onSeek}
            />
          </div>
        ) : (
          <VideoSourcePicker onSelect={changeSource} />
        )}
      </Section>

      <ReactionsOverlay socket={socket} />
    </List>
  );
}
