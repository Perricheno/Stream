import { randomUUID } from "node:crypto";
import type { LibraryVideo, VideoImportSourceType, VideoImportStatus } from "@stream/shared";
import { db } from "./database";

interface VideoRow {
  id: string;
  added_by_user_id: number;
  source_type: string;
  source_url: string | null;
  title: string;
  file_path: string | null;
  thumbnail_path: string | null;
  duration_seconds: number | null;
  status: string;
  progress_percent: number;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

/** Full row including on-disk paths — server-internal, never sent to a client. */
export interface VideoRecord extends LibraryVideo {
  filePath: string | null;
  thumbnailPath: string | null;
}

function rowToRecord(row: VideoRow): VideoRecord {
  return {
    id: row.id,
    addedByUserId: row.added_by_user_id,
    sourceType: row.source_type as VideoImportSourceType,
    sourceUrl: row.source_url,
    title: row.title,
    filePath: row.file_path,
    thumbnailPath: row.thumbnail_path,
    durationSeconds: row.duration_seconds,
    status: row.status as VideoImportStatus,
    progressPercent: row.progress_percent,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Strips the on-disk paths — the shape returned by the REST API. */
export function toLibraryVideo(record: VideoRecord): LibraryVideo {
  const { filePath: _f, thumbnailPath: _t, ...pub } = record;
  return pub;
}

export interface CreateVideoInput {
  addedByUserId: number;
  sourceType: VideoImportSourceType;
  sourceUrl: string | null;
  title?: string;
}

export function createVideo(input: CreateVideoInput): VideoRecord {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO videos (id, added_by_user_id, source_type, source_url, title, status, progress_percent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'downloading', 0, ?, ?)`,
  ).run(id, input.addedByUserId, input.sourceType, input.sourceUrl, input.title ?? "", now, now);
  return getVideo(id)!;
}

export function getVideo(id: string): VideoRecord | undefined {
  const row = db.prepare(`SELECT * FROM videos WHERE id = ?`).get(id) as VideoRow | undefined;
  return row ? rowToRecord(row) : undefined;
}

/** The owner's ready-to-play library (own downloads only — see the access
 *  note in http/videoLibraryRoutes.ts; playback access is broader). */
export function listReadyVideosByUser(userId: number): LibraryVideo[] {
  const rows = db
    .prepare(`SELECT * FROM videos WHERE added_by_user_id = ? AND status = 'ready' ORDER BY created_at DESC`)
    .all(userId) as unknown as VideoRow[];
  return rows.map((row) => toLibraryVideo(rowToRecord(row)));
}

/** The owner's whole library regardless of status — the "Мои видео" screen
 *  shows in-progress and failed imports too, not just what's ready to play. */
export function listVideosByUser(userId: number): LibraryVideo[] {
  const rows = db
    .prepare(`SELECT * FROM videos WHERE added_by_user_id = ? ORDER BY created_at DESC`)
    .all(userId) as unknown as VideoRow[];
  return rows.map((row) => toLibraryVideo(rowToRecord(row)));
}

/** Rows left mid-download by a previous process — nothing is resuming them. */
export function listInterruptedVideos(): VideoRecord[] {
  const rows = db.prepare(`SELECT * FROM videos WHERE status = 'downloading'`).all() as unknown as VideoRow[];
  return rows.map(rowToRecord);
}

export interface VideoUpdate {
  title?: string;
  filePath?: string | null;
  thumbnailPath?: string | null;
  durationSeconds?: number | null;
  status?: VideoImportStatus;
  progressPercent?: number;
  errorMessage?: string | null;
}

export function updateVideo(id: string, patch: VideoUpdate): void {
  const sets: string[] = [];
  const values: unknown[] = [];
  const put = (col: string, value: unknown) => {
    sets.push(`${col} = ?`);
    values.push(value);
  };

  if (patch.title !== undefined) put("title", patch.title);
  if (patch.filePath !== undefined) put("file_path", patch.filePath);
  if (patch.thumbnailPath !== undefined) put("thumbnail_path", patch.thumbnailPath);
  if (patch.durationSeconds !== undefined) put("duration_seconds", patch.durationSeconds);
  if (patch.status !== undefined) put("status", patch.status);
  if (patch.progressPercent !== undefined) put("progress_percent", Math.max(0, Math.min(100, Math.round(patch.progressPercent))));
  if (patch.errorMessage !== undefined) put("error_message", patch.errorMessage);
  if (sets.length === 0) return;

  put("updated_at", Date.now());
  values.push(id);
  db.prepare(`UPDATE videos SET ${sets.join(", ")} WHERE id = ?`).run(...(values as never[]));
}

export function deleteVideo(id: string): void {
  db.prepare(`DELETE FROM videos WHERE id = ?`).run(id);
}
