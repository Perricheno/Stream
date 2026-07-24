import { Avatar, Cell, Section } from "@telegram-apps/telegram-ui";
import type { ActiveFriendRoom } from "@stream/shared";

interface ActiveFriendRoomsListProps {
  rooms: ActiveFriendRoom[];
  onOpenRoom: (roomId: string) => void;
}

/** Quiet by default — nothing to show most of the time, so unlike
 *  RecentRoomsList this renders nothing at all rather than an empty-state
 *  placeholder when no friend currently has a room open. */
export function ActiveFriendRoomsList({ rooms, onOpenRoom }: ActiveFriendRoomsListProps) {
  if (rooms.length === 0) return null;

  return (
    <Section header="Смотрят сейчас">
      {rooms.map((room) => (
        <Cell
          key={room.roomId}
          before={<Avatar size={40} acronym={room.friendName.slice(0, 2)} />}
          subtitle={room.hasSource ? "Смотрит видео — нажмите, чтобы присоединиться" : "Ждёт в комнате — нажмите, чтобы присоединиться"}
          after={room.participantCount > 1 ? `${room.participantCount}` : undefined}
          onClick={() => onOpenRoom(room.roomId)}
          style={{ animation: "fadeSlideUp 0.2s ease" }}
        >
          {room.friendName}
        </Cell>
      ))}
    </Section>
  );
}
