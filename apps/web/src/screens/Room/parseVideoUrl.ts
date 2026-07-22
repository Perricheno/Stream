import type { VideoSource } from "@stream/shared";

const YOUTUBE_PATTERN = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/;

export function parseVideoUrl(raw: string): VideoSource | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const youtubeMatch = trimmed.match(YOUTUBE_PATTERN);
  if (youtubeMatch) return { type: "youtube", videoId: youtubeMatch[1] };

  if (!/^https?:\/\//i.test(trimmed)) return null;
  if (/\.m3u8(\?|$)/i.test(trimmed)) return { type: "file", url: trimmed, kind: "hls" };
  return { type: "file", url: trimmed, kind: "mp4" };
}
