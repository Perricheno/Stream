import type { VideoImportSourceType } from "@stream/shared";
import { matchYoutubeId } from "@stream/shared";

/** How a pasted link should be fetched. `youtube` and `direct_url` both go
 *  through yt-dlp (it handles direct files too, and applies the right
 *  headers/extractors for tube sites); `gdrive` has its own downloader. */
export interface ClassifiedImport {
  sourceType: VideoImportSourceType;
  /** For gdrive — the Drive file id parsed out of the share link. */
  driveFileId?: string;
}

const DRIVE_FILE_ID_PATTERNS = [
  /drive\.google\.com\/file\/d\/([\w-]+)/,
  /drive\.google\.com\/open\?id=([\w-]+)/,
  /drive\.google\.com\/uc\?(?:[^#]*&)?id=([\w-]+)/,
  /docs\.google\.com\/(?:document|presentation|spreadsheets)\/d\/([\w-]+)/,
];

export function parseDriveFileId(url: string): string | null {
  for (const pattern of DRIVE_FILE_ID_PATTERNS) {
    const match = pattern.exec(url);
    if (match) return match[1];
  }
  return null;
}

export function classifyImport(url: string): ClassifiedImport {
  const driveFileId = parseDriveFileId(url);
  if (driveFileId) return { sourceType: "gdrive", driveFileId };
  if (matchYoutubeId(url)) return { sourceType: "youtube" };
  return { sourceType: "direct_url" };
}
