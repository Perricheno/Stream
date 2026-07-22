import { useState } from "react";
import { Cell, IconButton, List, Modal } from "@telegram-apps/telegram-ui";
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

interface RoomMenuProps {
  onShare: () => void;
  hasSource: boolean;
  onChangeSource: () => void;
  onOpenSettings: () => void;
  onInviteFriend: () => void;
  onOpenQueue: () => void;
  queueCount: number;
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
          <Cell
            onClick={() => {
              setOpen(false);
              onShare();
            }}
          >
            {t("shareRoom")}
          </Cell>
          <Cell
            onClick={() => {
              setOpen(false);
              onInviteFriend();
            }}
          >
            {t("inviteToRoom")}
          </Cell>
          {hasSource && (
            <Cell
              onClick={() => {
                setOpen(false);
                onChangeSource();
              }}
            >
              {t("changeVideo")}
            </Cell>
          )}
          <Cell
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
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            {t("settings")}
          </Cell>
          {fullscreen.isSupported && (
            <Cell
              onClick={() => {
                setOpen(false);
                fullscreen.toggle();
              }}
            >
              {fullscreen.isFullscreen ? t("exitFullscreen") : t("enterFullscreen")}
            </Cell>
          )}
          <Cell
            style={{ color: "var(--tg-theme-destructive-text-color, #ec3942)" }}
            onClick={() => {
              setOpen(false);
              onLeave();
            }}
          >
            {t("leaveRoom")}
          </Cell>
        </List>
      </Modal>
    </>
  );
}
