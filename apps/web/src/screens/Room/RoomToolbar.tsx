import { Caption, IconButton } from "@telegram-apps/telegram-ui";
import { Icon20Copy } from "@telegram-apps/telegram-ui/dist/icons/20/copy";
import { useHapticFeedback } from "../../telegram/useHapticFeedback";
import { ServiceStatusIndicator } from "../../status/ServiceStatusIndicator";
import { RoomMenu } from "./RoomMenu";

interface RoomToolbarProps {
  roomId: string;
  onShare: () => void;
  hasSource: boolean;
  onChangeSource: () => void;
  onOpenSettings: () => void;
  onInviteFriend: () => void;
  onLeave: () => void;
}

export function RoomToolbar({
  roomId,
  onShare,
  hasSource,
  onChangeSource,
  onOpenSettings,
  onInviteFriend,
  onLeave,
}: RoomToolbarProps) {
  const haptics = useHapticFeedback();

  const copyRoomCode = () => {
    navigator.clipboard
      ?.writeText(roomId)
      .then(() => haptics.notify("success"))
      .catch(() => haptics.notify("error"));
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Caption level="1" style={{ color: "var(--tg-theme-hint-color, #708499)" }}>
          Комната {roomId}
        </Caption>
        <IconButton mode="plain" size="s" onClick={copyRoomCode} aria-label="Скопировать код комнаты">
          <Icon20Copy />
        </IconButton>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <ServiceStatusIndicator />
        <RoomMenu
          onShare={onShare}
          hasSource={hasSource}
          onChangeSource={onChangeSource}
          onOpenSettings={onOpenSettings}
          onInviteFriend={onInviteFriend}
          onLeave={onLeave}
        />
      </div>
    </div>
  );
}
