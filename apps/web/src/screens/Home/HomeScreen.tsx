import { useCallback, useState } from "react";
import { Button, IconButton, Input, List, Modal, Section } from "@telegram-apps/telegram-ui";
import { useHapticFeedback } from "../../telegram/useHapticFeedback";
import { useRecentRooms } from "../../telegram/useRecentRooms";
import { StickerPlayer } from "../../stickers/StickerPlayer";
import { ServiceStatusIndicator } from "../../status/ServiceStatusIndicator";
import { ModalBackdrop } from "../../components/ModalBackdrop";
import { SettingsPanel } from "../Settings/SettingsPanel";
import { CreateRoomCard } from "./CreateRoomCard";
import { RecentRoomsList } from "./RecentRoomsList";

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.94 2.5a7.99 7.99 0 0 0-.16-1.6l1.9-1.48a.75.75 0 0 0 .18-.95l-1.8-3.1a.75.75 0 0 0-.9-.32l-2.24.9a8.2 8.2 0 0 0-1.38-.8l-.34-2.38a.75.75 0 0 0-.74-.64h-3.6a.75.75 0 0 0-.74.64l-.34 2.38c-.5.2-.96.47-1.38.8l-2.24-.9a.75.75 0 0 0-.9.32l-1.8 3.1a.75.75 0 0 0 .18.95l1.9 1.48c-.1.52-.16 1.05-.16 1.6s.06 1.08.16 1.6l-1.9 1.48a.75.75 0 0 0-.18.95l1.8 3.1c.18.32.57.45.9.32l2.24-.9c.42.33.88.6 1.38.8l.34 2.38c.06.37.38.64.74.64h3.6c.36 0 .68-.27.74-.64l.34-2.38c.5-.2.96-.47 1.38-.8l2.24.9c.33.13.72 0 .9-.32l1.8-3.1a.75.75 0 0 0-.18-.95l-1.9-1.48c.1-.52.16-1.05.16-1.6z" />
    </svg>
  );
}

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
  const [settingsOpen, setSettingsOpen] = useState(false);

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, padding: "12px 16px 0" }}>
        <ServiceStatusIndicator />
        <IconButton mode="plain" size="m" onClick={() => setSettingsOpen(true)} aria-label="Настройки">
          <GearIcon />
        </IconButton>
      </div>

      <Section header="Stream" footer="Смотрите видео вместе с друзьями прямо в Telegram">
        <CreateRoomCard onCreate={createRoom} onJoin={() => setJoinOpen(true)} />
      </Section>

      <RecentRoomsList rooms={loaded ? rooms : null} onOpenRoom={onOpenRoom} />

      <Modal
        open={joinOpen}
        onOpenChange={setJoinOpen}
        header={<Modal.Header>Войти по коду</Modal.Header>}
        overlayComponent={<ModalBackdrop />}
        style={{ backgroundColor: "var(--tg-theme-secondary-bg-color, #232e3c)" }}
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

      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
    </List>
  );
}
