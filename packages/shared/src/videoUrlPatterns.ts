/** Shared between the client's instant fast-path parser and the server's
 *  page-scraping resolver, so "what counts as a YouTube/Vimeo/direct-file
 *  link" can't drift between the two. */

const YOUTUBE_PATTERN =
  /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/;

const VIMEO_PATTERN = /(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/;

export function matchYoutubeId(url: string): string | null {
  return url.match(YOUTUBE_PATTERN)?.[1] ?? null;
}

export function matchVimeoId(url: string): string | null {
  return url.match(VIMEO_PATTERN)?.[1] ?? null;
}

/** Extension-based sniff for direct media links — the common, instant case. */
export function matchMediaKind(url: string): "hls" | "mp4" | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  if (/\.m3u8$/i.test(path)) return "hls";
  if (/\.(mp4|webm|mkv|mov|m4v)$/i.test(path)) return "mp4";
  return null;
}