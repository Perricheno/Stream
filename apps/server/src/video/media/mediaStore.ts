import { createReadStream, existsSync, mkdirSync, type ReadStream } from "node:fs";
import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../../config/env";

if (!existsSync(env.mediaDir)) mkdirSync(env.mediaDir, { recursive: true });

/** Absolute path a downloader should write a video's file to. The id is a
 *  UUID (see videoRepository), so it's safe as a filename with no further
 *  sanitising; the extension is chosen by the downloader once it knows the
 *  container. */
export function mediaFilePath(id: string, extension: string): string {
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  return join(env.mediaDir, `${id}${ext}`);
}

/** Total size of everything currently in the media directory. */
export async function mediaDirBytes(): Promise<number> {
  let total = 0;
  for (const name of await readdir(env.mediaDir)) {
    try {
      const s = await stat(join(env.mediaDir, name));
      if (s.isFile()) total += s.size;
    } catch {
      // A file removed between readdir and stat — ignore.
    }
  }
  return total;
}

/**
 * Whether a new download of roughly `estimatedBytes` would keep the media
 * directory under the configured soft cap. `estimatedBytes` is usually
 * unknown up front (yt-dlp doesn't always report a size before starting) —
 * pass 0 and rely on the running-total check the download manager does
 * again as bytes land.
 */
export async function hasRoomFor(estimatedBytes: number): Promise<boolean> {
  const current = await mediaDirBytes();
  return current + Math.max(0, estimatedBytes) <= env.mediaMaxTotalBytes;
}

/** Removes every file for a video id (the video plus any sidecar like a
 *  thumbnail), used when an import fails or a row is deleted. */
export async function deleteMediaFiles(id: string): Promise<void> {
  for (const name of await readdir(env.mediaDir).catch(() => [] as string[])) {
    if (name === id || name.startsWith(`${id}.`)) {
      await unlink(join(env.mediaDir, name)).catch(() => undefined);
    }
  }
}

export interface RangeStream {
  stream: ReadStream;
  start: number;
  end: number;
  size: number;
}

/**
 * Opens a byte range of a file for an HTTP 206 response. `rangeHeader` is the
 * raw `Range:` request header (or undefined for a full-content request).
 * Returns null if the file is gone or the range is unsatisfiable.
 */
export async function openRange(filePath: string, rangeHeader: string | undefined): Promise<RangeStream | null> {
  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return null;
  }

  let start = 0;
  let end = size - 1;

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match) return null;
    const [, rawStart, rawEnd] = match;
    if (rawStart === "" && rawEnd === "") return null;

    if (rawStart === "") {
      // Suffix range: last N bytes.
      const suffix = Number(rawEnd);
      start = Math.max(0, size - suffix);
    } else {
      start = Number(rawStart);
      if (rawEnd !== "") end = Math.min(Number(rawEnd), size - 1);
    }
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) return null;
  }

  return { stream: createReadStream(filePath, { start, end }), start, end, size };
}
