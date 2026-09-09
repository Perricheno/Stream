import { useCallback, useEffect, useState } from "react";
import { Avatar, Button, Cell, IconButton, Input, List, Modal, Placeholder, Section, Snackbar } from "@telegram-apps/telegram-ui";
import type { LibraryVideo } from "@stream/shared";
import { useTranslation } from "../../i18n/useTranslation";
import { useHapticFeedback } from "../../telegram/useHapticFeedback";
import { confirmAction } from "../../telegram/confirmAction";
import { ModalBackdrop } from "../../components/ModalBackdrop";
import { StickerPlayer } from "../../stickers/StickerPlayer";
import { deleteVideo, importVideo, listVideos } from "../../api/videoApi";

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME as string | undefined;
const POLL_INTERVAL_MS = 3000;

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h2v9H7V9Zm4 0h2v9h-2V9Zm4 0h2v9h-2V9ZM6 7h12l-1 14H7L6 7Z" />
    </svg>
  );
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

interface LibraryScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Start a fresh room with this already-downloaded video loaded. */
  onWatch: (videoId: string, title: string) => void;
}

/**
 * "Мои видео" — the downloader's own home: everything the bot has fetched
 * (or is still fetching) for this user, with progress/failure shown inline,
 * a way to kick off a new download without going through the bot chat, and
 * per-video delete. Deliberately a flat list, not tied to any room.
 */
export function LibraryScreen({ open, onOpenChange, onWatch }: LibraryScreenProps) {
  const { t } = useTranslation();
  const haptics = useHapticFeedback();
  const [videos, setVideos] = useState<LibraryVideo[] | null>(null);
  const [linkValue, setLinkValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listVideos()
      .then(setVideos)
      .catch(() => setVideos((prev) => prev ?? []));
  }, []);

  // Poll while open and anything is still downloading — cheap (one small
  // list call), and it's the only way progress moves without a page reload.
  useEffect(() => {
    if (!open) return;
    refresh();
    const hasPending = (videos ?? []).some((v) => v.status === "downloading");
    if (!hasPending) return;
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refresh, videos?.map((v) => v.status).join(",")]);

  const addLink = useCallback(async () => {
    const url = linkValue.trim();
    if (!url) return;
    setAdding(true);
    try {
      const { video } = await importVideo(url);
      setVideos((prev) => [video, ...(prev ?? [])]);
      setLinkValue("");
      haptics.notify("success");
    } catch {
      haptics.notify("error");
      setToast(t("addLinkFailed"));
    } finally {
      setAdding(false);
    }
  }, [linkValue, haptics, t]);

  const remove = useCallback(
    async (video: LibraryVideo) => {
      const confirmed = await confirmAction(t("deleteVideoDescription"), t("deleteVideoTitle"), t("deleteVideoConfirm"));
      if (!confirmed) return;
      setDeletingId(video.id);
      try {
        await deleteVideo(video.id);
        setVideos((prev) => (prev ?? []).filter((v) => v.id !== video.id));
        haptics.notify("success");
      } catch {
        haptics.notify("error");
      } finally {
        setDeletingId(null);
      }
    },
    [haptics, t],
  );

  const openBot = useCallback(() => {
    if (BOT_USERNAME) window.open(`https://t.me/${BOT_USERNAME}`, "_blank");
  }, []);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={<Modal.Header>{t("myVideos")}</Modal.Header>}
      overlayComponent={<ModalBackdrop />}
      style={{ backgroundColor: "var(--tg-theme-secondary-bg-color, #232e3c)" }}
    >
      <List>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <Input
            placeholder={t("addLinkPlaceholder")}
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && addLink()}
          />
          <Button stretched size="l" loading={adding} disabled={!linkValue.trim() || adding} onClick={addLink}>
            {t("addLinkButton")}
          </Button>
        </div>

        {videos && videos.length === 0 ? (
          <Placeholder header={t("myVideosEmptyTitle")} description={t("myVideosEmptyDescription")}>
            <StickerPlayer id="searching" size={110} />
            {BOT_USERNAME && (
              <Button size="m" onClick={openBot} style={{ marginTop: 12 }}>
                {t("myVideosOpenBot")}
              </Button>
            )}
          </Placeholder>
        ) : (
          <Section>
            {(videos ?? []).map((video) => {
              const subtitle =
                video.status === "ready"
                  ? video.durationSeconds
                    ? formatDuration(video.durationSeconds)
                    : t("statusReady")
                  : video.status === "downloading"
                    ? `${t("libraryStatusDownloading")} · ${Math.round(video.progressPercent)}%`
                    : `${t("libraryStatusFailed")}${video.errorMessage ? `: ${video.errorMessage}` : ""}`;
              return (
                <div key={video.id}>
                  <Cell
                    before={<Avatar size={40} acronym="▶" />}
                    subtitle={subtitle}
                    onClick={video.status === "ready" ? () => onWatch(video.id, video.title || t("myVideos")) : undefined}
                    after={
                      <IconButton
                        mode="plain"
                        size="s"
                        disabled={deletingId === video.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void remove(video);
                        }}
                        aria-label={t("deleteVideoConfirm")}
                      >
                        <TrashIcon />
                      </IconButton>
                    }
                  >
                    {video.title || video.sourceUrl || video.id}
                  </Cell>
                  {video.status === "downloading" && (
                    <div
                      style={{
                        margin: "-6px 16px 10px",
                        height: 4,
                        borderRadius: 2,
                        background: "var(--tgui--outline, rgba(127,127,127,0.25))",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, video.progressPercent))}%`,
                          height: "100%",
                          background: "var(--tgui--link_color, #2ea6ff)",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </Section>
        )}
      </List>
      {toast && (
        <Snackbar onClose={() => setToast(null)} duration={2500}>
          {toast}
        </Snackbar>
      )}
    </Modal>
  );
}
