import { Avatar, AvatarStack, Caption } from "@telegram-apps/telegram-ui";
import type { Participant } from "@stream/shared";

interface ParticipantsBarProps {
  participants: Participant[];
}

function pluralParticipants(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "участник";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "участника";
  return "участников";
}

export function ParticipantsBar({ participants }: ParticipantsBarProps) {
  if (participants.length === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px" }}>
      <AvatarStack>
        {participants.slice(0, 5).map((participant) => (
          <Avatar
            key={participant.userId}
            size={28}
            src={participant.photoUrl}
            acronym={participant.firstName.slice(0, 2).toUpperCase()}
          />
        ))}
      </AvatarStack>
      <Caption level="1" style={{ color: "var(--tg-theme-hint-color, #708499)" }}>
        {participants.length} {pluralParticipants(participants.length)}
      </Caption>
    </div>
  );
}
