import { Router } from "express";
import { createVideo, deleteVideo, getVideo, listVideosByUser, toLibraryVideo, type VideoRecord } from "../db/videoRepository";
import { isUserWatchingLibraryVideo } from "../rooms/RoomStore";
import { classifyImport } from "../video/download/importSource";
import { cancelImport, enqueueImport } from "../video/download/downloadManager";
import { deleteMediaFiles } from "../video/media/mediaStore";
import { signStreamToken } from "../video/media/streamToken";
import { assertPublicHttpUrl } from "../video/ssrfGuard";
import { rateLimit } from "./rateLimit";
import "./types";

export const videoLibraryRoutes = Router();

/**
 * Two different access rules, deliberately not the same check:
 *  - listing your library (GET /) is owner-only;
 *  - playing a video (the stream token below, and reading one row) is allowed
 *    to anyone currently in a room that's playing it, whoever added it —
 *    otherwise an invited guest can't watch a video they didn't download.
 */
function canPlay(userId: number, record: VideoRecord): boolean {
  return record.addedByUserId === userId || isUserWatchingLibraryVideo(userId, record.id);
}

videoLibraryRoutes.get("/", (req, res) => {
  res.json(listVideosByUser(req.telegramUser!.id));
});

videoLibraryRoutes.post("/import", rateLimit(20, 60_000), async (req, res) => {
  const url = String((req.body as Record<string, unknown>)?.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: "invalid url" });
    return;
  }
  try {
    // Same SSRF guard the resolver uses — the download subsystem fetches this
    // URL on the server's behalf (yt-dlp / a direct GET), so a private/
    // internal address has to be rejected up front.
    await assertPublicHttpUrl(url);
  } catch {
    res.status(400).json({ error: "that link can't be fetched" });
    return;
  }

  const { sourceType } = classifyImport(url);
  const record = createVideo({ addedByUserId: req.telegramUser!.id, sourceType, sourceUrl: url });
  enqueueImport(record.id);
  res.json({ video: toLibraryVideo(record) });
});

videoLibraryRoutes.get("/:id", (req, res) => {
  const record = getVideo(req.params.id);
  if (!record || !canPlay(req.telegramUser!.id, record)) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(toLibraryVideo(record));
});

videoLibraryRoutes.delete("/:id", (req, res) => {
  const record = getVideo(req.params.id);
  // Deleting is owner-only — unlike playback, there's no reason a room guest
  // should be able to wipe a video out of someone else's library.
  if (!record || record.addedByUserId !== req.telegramUser!.id) {
    res.status(404).json({ error: "not found" });
    return;
  }
  cancelImport(record.id);
  deleteVideo(record.id);
  void deleteMediaFiles(record.id);
  res.json({ ok: true });
});

videoLibraryRoutes.get("/:id/stream-token", (req, res) => {
  const record = getVideo(req.params.id);
  if (!record || !canPlay(req.telegramUser!.id, record)) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (record.status !== "ready") {
    res.status(409).json({ error: "video is not ready yet" });
    return;
  }
  const { token, expiresInSeconds } = signStreamToken(record.id, req.telegramUser!.id);
  res.json({ token, expiresInSeconds });
});
