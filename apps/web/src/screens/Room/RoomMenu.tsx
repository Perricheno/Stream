import { useState } from "react";
import { Cell, IconButton, List, Modal } from "@telegram-apps/telegram-ui";
import { useTranslation } from "../../i18n/useTranslation";
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
  onLeave: () => void;
}

export function RoomMenu({ onShare, hasSource, onChangeSource, onOpenSettings, onInviteFriend, onLeave }: RoomMenuProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

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
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            {t("settings")}
          </Cell>
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
