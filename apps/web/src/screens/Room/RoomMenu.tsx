import { useState } from "react";
import { Cell, IconButton, List, Modal, Section } from "@telegram-apps/telegram-ui";
import { Icon24QR } from "@telegram-apps/telegram-ui/dist/icons/24/qr";
import { useTranslation } from "../../i18n/useTranslation";
import { useFullscreen } from "../../telegram/useFullscreen";
import { ModalBackdrop } from "../../components/ModalBackdrop";

function DotsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18 16.08a2.92 2.92 0 0 0-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81a3 3 0 1 0-3-3c0 .24.04.47.09.7L8.04 9.81A2.99 2.99 0 0 0 6 9a3 3 0 1 0 0 6c.79 0 1.5-.31 2.04-.81l7.12 4.16a2.85 2.85 0 0 0-.08.65 2.92 2.92 0 1 0 2.92-2.92z" />
    </svg>
  );
}

function InvitePersonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.33 0-8 1.67-8 5v2h11.1a5.5 5.5 0 0 1-.1-1c0-2.13.99-4.03 2.53-5.26A13.4 13.4 0 0 0 10 14zm9 0v3h-3v2h3v3h2v-3h3v-2h-3v-3z" />
    </svg>
  );
}

function ChangeVideoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18 4h-1.17L15 2H9L7.17 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-6 13.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8.2a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z" />
    </svg>
  );
}

function QueueListIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 6h13v2H4zm0 5h13v2H4zm0 5h9v2H4zm15.5-7L23 12.5 19.5 16v-2.5H16v-2h3.5z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.94 2.5a7.99 7.99 0 0 0-.16-1.6l1.9-1.48a.75.75 0 0 0 .18-.95l-1.8-3.1a.75.75 0 0 0-.9-.32l-2.24.9a8.2 8.2 0 0 0-1.38-.8l-.34-2.38a.75.75 0 0 0-.74-.64h-3.6a.75.75 0 0 0-.74.64l-.34 2.38c-.5.2-.96.47-1.38.8l-2.24-.9a.75.75 0 0 0-.9.32l-1.8 3.1a.75.75 0 0 0 .18.95l1.9 1.48c-.1.52-.16 1.05-.16 1.6s.06 1.08.16 1.6l-1.9 1.48a.75.75 0 0 0-.18.95l1.8 3.1c.18.32.57.45.9.32l2.24-.9c.42.33.88.6 1.38.8l.34 2.38c.06.37.38.64.74.64h3.6c.36 0 .68-.27.74-.64l.34-2.38c.5-.2.96-.47 1.38-.8l2.24.9c.33.13.72 0 .9-.32l1.8-3.1a.75.75 0 0 0-.18-.95l-1.9-1.48c.1-.52.16-1.05.16-1.6z" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 9V4h5v2H6v3H4zm0 6h2v3h3v2H4v-5zm16-6h-2V6h-3V4h5v5zm-2 6h2v5h-5v-2h3v-3z" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 4H7v3H4v2h5V4zm6 0v5h5V7h-3V4h-2zM4 15v2h3v3h2v-5H4zm11 5h2v-3h3v-2h-5v5z" />
    </svg>
  );
}

function DoorExitIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4v-2H6V5h4zm4.5 6.5L11 6v3H4v6h7v3l3.5-3.5L18 11zm2.5 8V5h-4V3h4a2 2 0 0 1 2 2v13.5a2.5 2.5 0 0 1-2.5 2.5H13v-2z" />
    </svg>
  );
}

interface RoomMenuProps {
  onShare: () => void;
  hasSource: boolean;
  onChangeSource: () => void;
  onOpenSettings: () => void;
  onInviteFriend: () => void;
  onOpenQueue: () => void;
  queueCount: number;
  onShowQr: () => void;
  onLeave: () => void;
}

export function RoomMenu({
  onShare,
  hasSource,
  onChangeSource,
  onOpenSettings,
  onInviteFriend,
  onOpenQueue,
  queueCount,
  onShowQr,
  onLeave,
}: RoomMenuProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const fullscreen = useFullscreen();

  return (
    <>
      <IconButton mode="plain" size="m" onClick={() => setOpen(true)} aria-label={t("menu")}>
        <DotsIcon />
      </IconButton>
      <Modal
        open={open}
        onOpenChange={setOpen}
        header={<Modal.Header>{t("menu")}</Modal.Header>}
        overlayComponent={<ModalBackdrop />}
        style={{ backgroundColor: "var(--tg-theme-secondary-bg-color, #232e3c)" }}
      >
        <List>
          <Section>
            <Cell
              before={<ShareIcon />}
              onClick={() => {
                setOpen(false);
                onShare();
              }}
            >
              {t("shareRoom")}
            </Cell>
            <Cell
              before={<InvitePersonIcon />}
              onClick={() => {
                setOpen(false);
                onInviteFriend();
              }}
            >
              {t("inviteToRoom")}
            </Cell>
            <Cell
              before={<Icon24QR />}
              onClick={() => {
                setOpen(false);
                onShowQr();
              }}
            >
              {t("showQrCode")}
            </Cell>
          </Section>

          <Section>
            {hasSource && (
              <Cell
                before={<ChangeVideoIcon />}
                onClick={() => {
                  setOpen(false);
                  onChangeSource();
                }}
              >
                {t("changeVideo")}
              </Cell>
            )}
            <Cell
              before={<QueueListIcon />}
              after={
                queueCount > 0 ? (
                  <span style={{ color: "var(--tg-theme-hint-color, #708499)", fontSize: 15 }}>{queueCount}</span>
                ) : undefined
              }
              onClick={() => {
                setOpen(false);
                onOpenQueue();
              }}
            >
              {t("queue")}
            </Cell>
            <Cell
              before={<GearIcon />}
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
            >
              {t("settings")}
            </Cell>
            {fullscreen.isSupported && (
              <Cell
                before={fullscreen.isFullscreen ? <CollapseIcon /> : <ExpandIcon />}
                onClick={() => {
                  setOpen(false);
                  fullscreen.toggle();
                }}
              >
                {fullscreen.isFullscreen ? t("exitFullscreen") : t("enterFullscreen")}
              </Cell>
            )}
          </Section>

          <Section>
            <Cell
              before={<DoorExitIcon />}
              style={{ color: "var(--tg-theme-destructive-text-color, #ec3942)" }}
              onClick={() => {
                setOpen(false);
                onLeave();
              }}
            >
              {t("leaveRoom")}
            </Cell>
          </Section>
        </List>
      </Modal>
    </>
  );
}
