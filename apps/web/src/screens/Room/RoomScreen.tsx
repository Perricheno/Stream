import { useCallback, useEffect, useState } from "react";
import { List, Placeholder } from "@telegram-apps/telegram-ui";
import { shareURL } from "@telegram-apps/sdk-react";
import type { VideoSource } from "@stream/shared";
import { useBackButton } from "../../telegram/useBackButton";
import { useHapticFeedback } from "../../telegram/useHapticFeedback";
import { useTelegramUser } from "../../telegram/useInitData";
import { useUserSettings } from "../../telegram/useUserSettings";
import { confirmAction } from "../../telegram/confirmAction";
import { useRoomSocket } from "../../socket/useRoomSocket";
import { socket } from "../../socket/socketClient";
import { useSyncedPlayback } from "../../player/useSyncedPlayback";
import { VideoPlayer } from "../../player/VideoPlayer";
import { StickerPlayer } from "../../stickers/StickerPlayer";
import { SettingsPanel } from "../Settings/SettingsPanel";
import { ParticipantsBar } from "./ParticipantsBar";
import { VideoSourcePicker } from "./VideoSourcePicker";
import { RoomToolbar } from "./RoomToolbar";
import { ChatPanel } from "./ChatPanel";

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME as string | undefined;

interface RoomScreenProps {
  roomId: string;
  onExit: () => void;
}

export function RoomScreen({ roomId, onExit }: RoomScreenProps) {
  const { settings } = useUserSettings();
  const { status, room, error } = useRoomSocket(roomId, settings);
  const haptics = useHapticFeedback();
  const telegramUser = useTelegramUser();
  const synced = useSyncedPlayback(socket, room?.playback ?? null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickingSource, setPickingSource] = useState(false);

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

  useEffect(() => {
    if (status === "joined") haptics.notify("success");
    if (status === "error") haptics.notify("error");
  }, [status, haptics]);

  const changeSource = useCallback((source: VideoSource) => {
    socket.emit("playback:change-source", { source });
    setPickingSource(false);
  }, []);

  const sendChat = useCallback((text: string) => {
    socket.emit("chat:send", { text });
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
      <RoomToolbar
        roomId={roomId}
        onShare={handleShare}
        hasSource={Boolean(room.source) && !pickingSource}
        onChangeSource={() => setPickingSource(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onLeave={handleBack}
      />
      <ParticipantsBar participants={room.participants} />

      <div style={{ padding: 16 }}>
        {room.source && !pickingSource ? (
          <VideoPlayer
            source={room.source}
            playerRef={synced.playerRef}
            suppressed={synced.suppressed}
            onPlay={synced.onPlay}
            onPause={synced.onPause}
            onSeek={synced.onSeek}
          />
        ) : (
          <VideoSourcePicker onSelect={changeSource} />
        )}
      </div>

      <ChatPanel messages={room.messages} currentUserId={telegramUser?.id} onSend={sendChat} />

      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
    </List>
  );
}
