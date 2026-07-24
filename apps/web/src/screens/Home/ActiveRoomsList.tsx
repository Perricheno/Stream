import { Avatar, Cell, Section } from "@telegram-apps/telegram-ui";
import type { ActiveRoom } from "@stream/shared";

interface ActiveRoomsListProps {
  rooms: ActiveRoom[];
  onOpenRoom: (roomId: string) => void;
}

/** Quiet by default — nothing to show most of the time, so unlike
 *  RecentRoomsList this renders nothing at all rather than an empty-state
 *  placeholder when no room is currently open. */
export function ActiveRoomsList({ rooms, onOpenRoom }: ActiveRoomsListProps) {
  if (rooms.length === 0) return null;

  return (
    <Section header="Смотрят сейчас">
      {rooms.map((room) => (
        <Cell
          key={room.roomId}
          before={<Avatar size={40} acronym={room.hostName.slice(0, 2)} />}
          subtitle={room.hasSource ? "Смотрят видео — нажмите, чтобы присоединиться" : "Ждут в комнате — нажмите, чтобы присоединиться"}
          after={room.participantCount > 1 ? `${room.participantCount}` : undefined}
          onClick={() => onOpenRoom(room.roomId)}
          style={{ animation: "fadeSlideUp 0.2s ease" }}
        >
          {room.hostName}
        </Cell>
      ))}
    </Section>
  );
}
