import { Avatar, Cell, Placeholder, Section } from "@telegram-apps/telegram-ui";
import { StickerPlayer } from "../../stickers/StickerPlayer";

interface RecentRoomsListProps {
  rooms: string[] | null;
  onOpenRoom: (roomId: string) => void;
}

export function RecentRoomsList({ rooms, onOpenRoom }: RecentRoomsListProps) {
  if (!rooms || rooms.length === 0) {
    return (
      <Placeholder
        header="Пока пусто"
        description="Создайте комнату или войдите по коду, чтобы начать совместный просмотр"
      >
        <StickerPlayer id="not-found" size={120} />
      </Placeholder>
    );
  }

  return (
    <Section header="Недавние комнаты">
      {rooms.map((roomId) => (
        <Cell
          key={roomId}
          before={<Avatar size={40} acronym={roomId.slice(0, 2)} />}
          subtitle="Нажмите, чтобы войти снова"
          onClick={() => onOpenRoom(roomId)}
        >
          Комната {roomId}
        </Cell>
      ))}
    </Section>
  );
}
