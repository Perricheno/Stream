import { Caption, IconButton } from "@telegram-apps/telegram-ui";
import { Icon20Copy } from "@telegram-apps/telegram-ui/dist/icons/20/copy";
import { useHapticFeedback } from "../../telegram/useHapticFeedback";
import { ServiceStatusIndicator } from "../../status/ServiceStatusIndicator";
import { RoomMenu } from "./RoomMenu";

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4.7 3.53A.5.5 0 0 1 2.5 20V5a1 1 0 0 1 1-1z" />
    </svg>
  );
}

interface RoomToolbarProps {
  roomId: string;
  onShare: () => void;
  hasSource: boolean;
  onChangeSource: () => void;
  onOpenSettings: () => void;
  onInviteFriend: () => void;
  onOpenQueue: () => void;
  queueCount: number;
  onShowQr: () => void;
  onLeave: () => void;
  onOpenChat: () => void;
  unreadCount: number;
}

export function RoomToolbar({
  roomId,
  onShare,
  hasSource,
  onChangeSource,
  onOpenSettings,
  onInviteFriend,
  onOpenQueue,
  queueCount,
  onShowQr,
  onLeave,
  onOpenChat,
  unreadCount,
}: RoomToolbarProps) {
  const haptics = useHapticFeedback();

  const copyRoomCode = () => {
    navigator.clipboard
      ?.writeText(roomId)
      .then(() => haptics.notify("success"))
      .catch(() => haptics.notify("error"));
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Caption level="1" style={{ color: "var(--tg-theme-hint-color, #708499)" }}>
          Комната {roomId}
        </Caption>
        <IconButton mode="plain" size="m" onClick={copyRoomCode} aria-label="Скопировать код комнаты">
          <Icon20Copy />
        </IconButton>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ position: "relative", display: "flex" }}>
          <IconButton mode="plain" size="m" onClick={onOpenChat} aria-label="Чат">
            <ChatIcon />
          </IconButton>
          {unreadCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: 2,
                right: 2,
                minWidth: 15,
                height: 15,
                padding: "0 3px",
                borderRadius: 8,
                background: "var(--tg-theme-destructive-text-color, #ec3942)",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: "15px",
                textAlign: "center",
                pointerEvents: "none",
                animation: "popIn 0.2s ease",
              }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </span>
        <ServiceStatusIndicator />
        <RoomMenu
          onShare={onShare}
          hasSource={hasSource}
          onChangeSource={onChangeSource}
          onOpenSettings={onOpenSettings}
          onInviteFriend={onInviteFriend}
          onOpenQueue={onOpenQueue}
          queueCount={queueCount}
          onShowQr={onShowQr}
          onLeave={onLeave}
        />
      </div>
    </div>
  );
}
