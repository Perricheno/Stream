import { EventEmitter } from "node:events";
import { rename } from "node:fs/promises";
import { env } from "../../config/env";
import { getVideo, listInterruptedVideos, updateVideo } from "../../db/videoRepository";
import { deleteMediaFiles, hasRoomFor, mediaFilePath } from "../media/mediaStore";
import { downloadFromDrive } from "./googleDrive";
import { classifyImport } from "./importSource";
import { ensureStreamable } from "./probe";
import { downloadTelegramFile } from "./telegramFile";
import { looksLikeBotBlock, runYtDlp } from "./ytdlp";

/** How a `telegram_upload` row stores the file reference in `source_url`
 *  (there's no real URL for a file sent to the bot). */
export const TELEGRAM_UPLOAD_REF_PREFIX = "tgfile:";

export interface DownloadProgress {
  videoId: string;
  status: "downloading" | "converting" | "ready" | "failed";
  progressPercent: number;
  /** Human-readable transfer speed while downloading (yt-dlp's own string). */
  speedText?: string;
  title?: string;
  errorMessage?: string;
}

const MAX_CONCURRENT = 2;
// Hard ceiling for a single Google Drive file (yt-dlp jobs are bounded by the
// wall-clock timeout instead).
const DRIVE_FILE_MAX_BYTES = 8 * 1024 ** 3;

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const active = new Map<string, AbortController>();
const queue: string[] = [];

/** Subscribe to progress for one import. Returns an unsubscribe function. */
export function onDownloadProgress(videoId: string, listener: (p: DownloadProgress) => void): () => void {
  const handler = (p: DownloadProgress) => {
    if (p.videoId === videoId) listener(p);
  };
  emitter.on("progress", handler);
  return () => emitter.off("progress", handler);
}

function emit(p: DownloadProgress): void {
  emitter.emit("progress", p);
}

/** Queues a freshly-created `videos` row for download. Fire-and-forget. */
export function enqueueImport(videoId: string): void {
  if (active.has(videoId) || queue.includes(videoId)) return;
  queue.push(videoId);
  pump();
}

export function cancelImport(videoId: string): void {
  active.get(videoId)?.abort();
  const i = queue.indexOf(videoId);
  if (i !== -1) queue.splice(i, 1);
}

function pump(): void {
  while (active.size < MAX_CONCURRENT && queue.length > 0) {
    const videoId = queue.shift()!;
    const controller = new AbortController();
    active.set(videoId, controller);
    void runJob(videoId, controller.signal)
      .catch((err) => console.error(`[download] job ${videoId} threw`, err))
      .finally(() => {
        active.delete(videoId);
        pump();
      });
  }
}

async function runJob(videoId: string, signal: AbortSignal): Promise<void> {
  const record = getVideo(videoId);
  if (!record || record.status !== "downloading") return;

  const fail = (message: string) => {
    updateVideo(videoId, { status: "failed", errorMessage: message });
    void deleteMediaFiles(videoId);
    emit({ videoId, status: "failed", progressPercent: record.progressPercent, errorMessage: message });
  };

  if (!(await hasRoomFor(0))) {
    fail("the server is out of storage space");
    return;
  }

  // The bot chat's progress edits subscribe to emit() directly (live,
  // in-memory) but the Mini App's My Videos screen only has REST polling —
  // without persisting to the DB here too, it stays stuck at 0% the whole
  // download and only jumps once at the end. Throttled the same way the
  // bot throttles its own message edits, so a fast yt-dlp progress stream
  // doesn't turn into a SQLite write per tick.
  const PERSIST_THROTTLE_MS = 2000;
  let lastPersistedAt = 0;

  try {
    const rawBase = mediaFilePath(videoId, ".src"); // yt-dlp/Drive write here first
    let downloadedPath: string;
    let title = record.title;

    const reportProgress = (percent: number, speedText?: string) => {
      emit({ videoId, status: "downloading", progressPercent: percent, speedText, title });
      const now = Date.now();
      if (now - lastPersistedAt >= PERSIST_THROTTLE_MS) {
        lastPersistedAt = now;
        updateVideo(videoId, { progressPercent: percent });
      }
    };

    if (record.sourceType === "gdrive") {
      const { driveFileId } = classifyImport(record.sourceUrl ?? "");
      if (!driveFileId) throw new Error("couldn't read that Google Drive link");
      const out = mediaFilePath(videoId, ".src.bin");
      const res = await downloadFromDrive({
        fileId: driveFileId,
        outputPath: out,
        maxBytes: DRIVE_FILE_MAX_BYTES,
        signal,
        onProgress: (percent) => reportProgress(percent),
      });
      downloadedPath = res.filePath;
      title = title || res.title;
    } else if (record.sourceType === "telegram_upload") {
      const fileId = (record.sourceUrl ?? "").replace(TELEGRAM_UPLOAD_REF_PREFIX, "");
      if (!fileId) throw new Error("missing Telegram file reference");
      const out = mediaFilePath(videoId, ".src.bin");
      const res = await downloadTelegramFile({
        fileId,
        outputPath: out,
        signal,
        onProgress: (percent) => reportProgress(percent),
      });
      downloadedPath = res.filePath;
    } else {
      const onProgress = (percentText: string, speedText: string) => reportProgress(parsePercent(percentText), speedText || undefined);
      const url = record.sourceUrl ?? "";

      let res;
      try {
        res = await runYtDlp({ url, outputBase: rawBase, signal, onProgress });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Several tube sites answer yt-dlp's default TLS fingerprint with a
        // flat 403 before extraction even starts. Retrying once with a
        // browser fingerprint gets past that; the first attempt stays plain
        // so the paths that already work (YouTube's cookie/PO-token flow)
        // aren't disturbed.
        if (signal.aborted || !env.ytDlpImpersonate || !looksLikeBotBlock(message)) throw err;
        console.log(`[download] ${videoId} blocked (${message}) — retrying as ${env.ytDlpImpersonate}`);
        res = await runYtDlp({ url, outputBase: rawBase, signal, onProgress, impersonate: env.ytDlpImpersonate });
      }

      downloadedPath = res.filePath;
      title = title || res.title;
      if (res.durationSeconds) updateVideo(videoId, { durationSeconds: res.durationSeconds });
    }

    if (signal.aborted) throw new Error("cancelled");

    updateVideo(videoId, { progressPercent: 99, title });
    emit({ videoId, status: "converting", progressPercent: 99, title });

    const finalPath = mediaFilePath(videoId, ".mp4");
    const tmpOut = mediaFilePath(videoId, ".conv.mp4");
    const streamable = await ensureStreamable(downloadedPath, tmpOut, signal);
    if (streamable.path !== finalPath) await rename(streamable.path, finalPath);

    updateVideo(videoId, {
      status: "ready",
      filePath: finalPath,
      progressPercent: 100,
      title,
      durationSeconds: streamable.durationSeconds ?? record.durationSeconds ?? null,
      errorMessage: null,
    });
    emit({ videoId, status: "ready", progressPercent: 100, title });
  } catch (err) {
    if (signal.aborted) {
      updateVideo(videoId, { status: "failed", errorMessage: "cancelled" });
      void deleteMediaFiles(videoId);
      return;
    }
    fail(err instanceof Error ? err.message : "download failed");
  }
}

function parsePercent(text: string): number {
  const n = parseFloat(text.replace("%", "").trim());
  return Number.isFinite(n) ? Math.max(0, Math.min(99, n)) : 0;
}

/**
 * On boot, any row still marked `downloading` is a leftover from a previous
 * process that died mid-job — nothing is resuming it, so mark it failed so
 * the UI doesn't spin forever. The user can re-add the link.
 */
export function reconcileInterruptedDownloads(): void {
  for (const record of listInterruptedVideos()) {
    updateVideo(record.id, { status: "failed", errorMessage: "the download was interrupted — try again" });
    void deleteMediaFiles(record.id);
  }
}
