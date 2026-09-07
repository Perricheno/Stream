/** The private per-user library of downloaded / imported videos. Rows start
 *  as `downloading` and are progressed in place by the server's download
 *  subsystem until they reach `ready` (playable) or `failed`. */

export type VideoImportStatus = "downloading" | "ready" | "failed";

export type VideoImportSourceType = "youtube" | "gdrive" | "telegram_upload" | "direct_url";

/** Shape returned by GET /api/videos and GET /api/videos/:id — the on-disk
 *  file path and thumbnail path are deliberately not part of it. */
export interface LibraryVideo {
  id: string;
  addedByUserId: number;
  sourceType: VideoImportSourceType;
  sourceUrl: string | null;
  title: string;
  durationSeconds: number | null;
  status: VideoImportStatus;
  progressPercent: number;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

export const VIDEO_TITLE_MAX_LENGTH = 200;
