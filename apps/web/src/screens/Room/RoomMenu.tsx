import { useState } from "react";
import { Cell, IconButton, List, Modal } from "@telegram-apps/telegram-ui";

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
  onLeave: () => void;
}

export function RoomMenu({ onShare, hasSource, onChangeSource, onOpenSettings, onLeave }: RoomMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton mode="plain" size="m" onClick={() => setOpen(true)} aria-label="Меню">
        <DotsIcon />
      </IconButton>
      <Modal open={open} onOpenChange={setOpen} header={<Modal.Header>Меню</Modal.Header>}>
        <List>
          <Cell
            onClick={() => {
              setOpen(false);
              onShare();
            }}
          >
            Поделиться комнатой
          </Cell>
          {hasSource && (
            <Cell
              onClick={() => {
                setOpen(false);
                onChangeSource();
              }}
            >
              Сменить видео
            </Cell>
          )}
          <Cell
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            Настройки
          </Cell>
          <Cell
            style={{ color: "var(--tg-theme-destructive-text-color, #ec3942)" }}
            onClick={() => {
              setOpen(false);
              onLeave();
            }}
          >
            Покинуть комнату
          </Cell>
        </List>
      </Modal>
    </>
  );
}
