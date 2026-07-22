import { useCallback, useMemo, useState } from "react";
import { Button, Cell, IconButton, Input, List, Modal, Placeholder, Section } from "@telegram-apps/telegram-ui";
import type { QueueItem } from "@stream/shared";
import { useTranslation } from "../../i18n/useTranslation";
import { StickerPlayer } from "../../stickers/StickerPlayer";
import { ModalBackdrop } from "../../components/ModalBackdrop";
import { parseVideoUrl } from "./parseVideoUrl";

function RemoveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function describeSource(item: QueueItem): string {
  return item.source.type === "youtube" ? `youtu.be/${item.source.videoId}` : item.source.url;
}

interface QueuePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: QueueItem[];
  isHost: boolean;
  onAdd: (raw: string) => void;
  onRemove: (itemId: string) => void;
}

export function QueuePanel({ open, onOpenChange, queue, isHost, onAdd, onRemove }: QueuePanelProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const parsed = useMemo(() => parseVideoUrl(value), [value]);
  const isInvalid = value.trim().length > 0 && !parsed;

  const submit = useCallback(() => {
    if (!parsed) return;
    onAdd(value);
    setValue("");
  }, [parsed, value, onAdd]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={<Modal.Header>{t("queue")}</Modal.Header>}
      overlayComponent={<ModalBackdrop />}
      style={{ backgroundColor: "var(--tg-theme-secondary-bg-color, #232e3c)" }}
    >
      <List>
        {queue.length === 0 ? (
          <Placeholder header={t("queueEmpty")} description={t("queueEmptyDescription")}>
            <StickerPlayer id="searching" size={100} />
          </Placeholder>
        ) : (
          <Section header={t("queueUpNext")}>
            {queue.map((item, index) => (
              <Cell
                key={item.id}
                subtitle={item.addedByName}
                after={
                  isHost ? (
                    <IconButton mode="plain" size="s" onClick={() => onRemove(item.id)} aria-label={t("queueRemove")}>
                      <RemoveIcon />
                    </IconButton>
                  ) : undefined
                }
              >
                {index + 1}. {describeSource(item)}
              </Cell>
            ))}
          </Section>
        )}
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <Input
            placeholder="https://youtube.com/watch?v=..."
            value={value}
            status={isInvalid ? "error" : "default"}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button stretched size="l" disabled={!parsed} onClick={submit}>
            {t("queueAdd")}
          </Button>
        </div>
      </List>
    </Modal>
  );
}
