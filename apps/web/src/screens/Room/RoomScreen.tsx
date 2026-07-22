import { useCallback, useEffect, useRef, useState } from "react";
import { List, Placeholder } from "@telegram-apps/telegram-ui";
import { shareURL } from "@telegram-apps/sdk-react";
import type { VideoSource } from "@stream/shared";
import { useBackButton } from "../../telegram/useBackButton";
import { useHapticFeedback } from "../../telegram/useHapticFeedback";
import { useTelegramUser } from "../../telegram/useInitData";
import { useProfile } from "../../telegram/ProfileContext";
import { confirmAction } from "../../telegram/confirmAction";
import { useRoomSocket } from "../../socket/useRoomSocket";
import { socket } from "../../socket/socketClient";
import { useSyncedPlayback } from "../../player/useSyncedPlayback";
import { VideoPlayer } from "../../player/VideoPlayer";
import { StickerPlayer } from "../../stickers/StickerPlayer";
import { SettingsPanel } from "../Settings/SettingsPanel";
import { FriendsPanel } from "../Friends/FriendsPanel";
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
  const { status, room, error } = useRoomSocket(roomId);
  const { profile } = useProfile();
  const haptics = useHapticFeedback();
  const telegramUser = useTelegramUser();
  const synced = useSyncedPlayback(socket, room?.playback ?? null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [pickingSource, setPickingSource] = useState(false);
  const autoplayedSourceRef = useRef<string | null>(null);
  const lastParticipantCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (!room?.source || profile?.autoplay === false) return;
    const sourceKey = JSON.stringify(room.source);
    if (autoplayedSourceRef.current === sourceKey) return;
    autoplayedSourceRef.current = sourceKey;
    const timer = setTimeout(() => synced.playerRef.current?.play(), 800);
    return () => clearTimeout(timer);
  }, [room?.source, profile?.autoplay, synced.playerRef]);

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

  // Notify (haptic) when participants come and go, if the user opted in.
  useEffect(() => {
    if (!room) return;
    const count = room.participants.length;
    const previous = lastParticipantCountRef.current;
    lastParticipantCountRef.current = count;
    if (previous === null || previous === count || profile?.notificationsEnabled === false) return;
    haptics.selectionChanged();
  }, [room?.participants.length, profile?.notificationsEnabled, haptics, room]);

  const changeSource = useCallback((source: VideoSource) => {
    socket.emit("playback:change-source", { source });
    setPickingSource(false);
  }, []);

  const sendChat = useCallback((text: string) => {
    socket.emit("chat:send", { text });
  }, []);

  const kickParticipant = useCallback((targetUserId: number) => {
    socket.emit("room:kick", { targetUserId });
  }, []);

  if (status === "idle" || status === "connecting") {
    return (
      <Placeholder header="Подключаемся..." description={`Комната ${roomId}`}>
        <StickerPlayer id="calling" size={120} />
      </Placeholder>
    );
  }

  if (status === "kicked") {
    return (
      <Placeholder header="Вас удалили из комнаты" description="Хост завершил ваше участие в этой комнате">
        <StickerPlayer id="blocked" size={120} />
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

  const isHost = room.participants.find((p) => p.userId === telegramUser?.id)?.isHost ?? false;

  return (
    <List>
      <RoomToolbar
        roomId={roomId}
        onShare={handleShare}
        hasSource={Boolean(room.source) && !pickingSource}
        onChangeSource={() => setPickingSource(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onInviteFriend={() => setFriendsOpen(true)}
        onLeave={handleBack}
      />
      <ParticipantsBar
        participants={room.participants}
        currentUserId={telegramUser?.id}
        isHost={isHost}
        onKick={kickParticipant}
      />

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

      <FriendsPanel open={friendsOpen} onOpenChange={setFriendsOpen} roomId={roomId} />
      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
    </List>
  );
}
