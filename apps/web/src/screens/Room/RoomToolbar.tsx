import { Caption, IconButton } from "@telegram-apps/telegram-ui";
import { Icon24Chat } from "@telegram-apps/telegram-ui/dist/icons/24/chat";
import { ServiceStatusIndicator } from "../../status/ServiceStatusIndicator";
import { RoomMenu } from "./RoomMenu";

interface RoomToolbarProps {
  roomId: string;
  onOpenChat: () => void;
  onShare: () => void;
  hasSource: boolean;
  onChangeSource: () => void;
  onOpenSettings: () => void;
  onLeave: () => void;
}

export function RoomToolbar({
  roomId,
  onOpenChat,
  onShare,
  hasSource,
  onChangeSource,
  onOpenSettings,
  onLeave,
}: RoomToolbarProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 0" }}>
      <Caption level="1" style={{ color: "var(--tg-theme-hint-color, #708499)" }}>
        Комната {roomId}
      </Caption>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <ServiceStatusIndicator />
        <IconButton mode="plain" size="m" onClick={onOpenChat} aria-label="Чат">
          <Icon24Chat />
        </IconButton>
        <RoomMenu
          onShare={onShare}
          hasSource={hasSource}
          onChangeSource={onChangeSource}
          onOpenSettings={onOpenSettings}
          onLeave={onLeave}
        />
      </div>
    </div>
  );
}
