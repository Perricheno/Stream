import { useCallback, useState } from "react";
import { Button, Input, List, Modal, Section } from "@telegram-apps/telegram-ui";
import { useHapticFeedback } from "../../telegram/useHapticFeedback";
import { useRecentRooms } from "../../telegram/useRecentRooms";
import { StickerPlayer } from "../../stickers/StickerPlayer";
import { CreateRoomCard } from "./CreateRoomCard";
import { RecentRoomsList } from "./RecentRoomsList";

function generateRoomId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

interface HomeScreenProps {
  onOpenRoom: (roomId: string) => void;
}

export function HomeScreen({ onOpenRoom }: HomeScreenProps) {
  const { rooms, loaded, addRoom } = useRecentRooms();
  const haptics = useHapticFeedback();
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  const createRoom = useCallback(() => {
    haptics.impact("medium");
    const id = generateRoomId();
    addRoom(id);
    onOpenRoom(id);
  }, [addRoom, onOpenRoom, haptics]);

  const joinRoom = useCallback(() => {
    const id = joinCode.trim().toUpperCase();
    if (!id) return;
    haptics.impact("medium");
    addRoom(id);
    setJoinOpen(false);
    setJoinCode("");
    onOpenRoom(id);
  }, [joinCode, addRoom, onOpenRoom, haptics]);

  return (
    <List>
      <Section header="Stream" footer="Смотрите видео вместе с друзьями прямо в Telegram">
        <CreateRoomCard onCreate={createRoom} onJoin={() => setJoinOpen(true)} />
      </Section>

      <RecentRoomsList rooms={loaded ? rooms : null} onOpenRoom={onOpenRoom} />

      <Modal
        open={joinOpen}
        onOpenChange={setJoinOpen}
        header={<Modal.Header>Войти по коду</Modal.Header>}
      >
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <StickerPlayer id="invite" size={96} />
          </div>
          <Input
            header="Код комнаты"
            placeholder="Например, AB12CD"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
          />
          <Button stretched size="l" disabled={!joinCode.trim()} onClick={joinRoom}>
            Войти
          </Button>
        </div>
      </Modal>
    </List>
  );
}
