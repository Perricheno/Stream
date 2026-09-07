import { useCallback, useState, type KeyboardEvent } from "react";
import { Button, Cell, IconButton, Input, List, Modal, Placeholder, Section } from "@telegram-apps/telegram-ui";
import type { QueueItem, VideoSource } from "@stream/shared";
import { useTranslation } from "../../i18n/useTranslation";
import { StickerPlayer } from "../../stickers/StickerPlayer";
import { ModalBackdrop } from "../../components/ModalBackdrop";
import { resolveVideo } from "../../api/videoApi";
import { parseVideoUrl } from "./parseVideoUrl";

function RemoveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function describeSource(source: VideoSource): string {
  switch (source.type) {
    case "youtube":
      return `youtu.be/${source.videoId}`;
    case "vimeo":
      return `vimeo.com/${source.videoId}`;
    case "file":
      return source.url;
    case "library":
      return source.title ?? source.videoId;
  }
}

interface QueuePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: QueueItem[];
  isHost: boolean;
  onAdd: (source: VideoSource) => void;
  onRemove: (itemId: string) => void;
}

export function QueuePanel({ open, onOpenChange, queue, isHost, onAdd, onRemove }: QueuePanelProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);

    const fastParsed = parseVideoUrl(trimmed);
    if (fastParsed) {
      onAdd(fastParsed);
      setValue("");
      return;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      setError(t("linkNotRecognized"));
      return;
    }

    setLoading(true);
    try {
      onAdd(await resolveVideo(trimmed));
      setValue("");
    } catch {
      setError(t("resolveFailed"));
    } finally {
      setLoading(false);
    }
  }, [value, onAdd, t]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") void submit();
  };

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
                style={{ animation: "fadeSlideUp 0.25s ease backwards", animationDelay: `${Math.min(index, 8) * 30}ms` }}
                after={
                  isHost ? (
                    <IconButton mode="plain" size="s" onClick={() => onRemove(item.id)} aria-label={t("queueRemove")}>
                      <RemoveIcon />
                    </IconButton>
                  ) : undefined
                }
              >
                {index + 1}. {describeSource(item.source)}
              </Cell>
            ))}
          </Section>
        )}
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <Input
            placeholder="https://youtube.com/watch?v=..."
            value={value}
            status={error ? "error" : "default"}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
          />
          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StickerPlayer id="confused" size={28} />
              <span style={{ color: "var(--tg-theme-destructive-text-color, #ec3942)", fontSize: 14 }}>{error}</span>
            </div>
          )}
          <Button stretched size="l" loading={loading} disabled={!value.trim() || loading} onClick={submit}>
            {t("queueAdd")}
          </Button>
        </div>
      </List>
    </Modal>
  );
}
