import { Caption } from "@telegram-apps/telegram-ui";
import { ServiceStatusIndicator } from "../../status/ServiceStatusIndicator";
import { RoomMenu } from "./RoomMenu";

interface RoomToolbarProps {
  roomId: string;
  onShare: () => void;
  hasSource: boolean;
  onChangeSource: () => void;
  onOpenSettings: () => void;
  onLeave: () => void;
}

export function RoomToolbar({ roomId, onShare, hasSource, onChangeSource, onOpenSettings, onLeave }: RoomToolbarProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 0" }}>
      <Caption level="1" style={{ color: "var(--tg-theme-hint-color, #708499)" }}>
        Комната {roomId}
      </Caption>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <ServiceStatusIndicator />
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
