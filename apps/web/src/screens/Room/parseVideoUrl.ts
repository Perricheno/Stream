import { matchMediaKind, matchVimeoId, matchYoutubeId, type VideoSource } from "@stream/shared";

/**
 * Instant, synchronous fast-path — recognizes YouTube/Vimeo links and direct
 * media files without a network round-trip. Anything else (a page that only
 * *contains* a video, a tube-site link, a Google Drive share) goes to the
 * server: resolveVideo() either returns a directly playable source or kicks
 * off a download into the library — see api/videoApi.ts.
 */
export function parseVideoUrl(raw: string): VideoSource | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const youtubeId = matchYoutubeId(trimmed);
  if (youtubeId) return { type: "youtube", videoId: youtubeId };

  const vimeoId = matchVimeoId(trimmed);
  if (vimeoId) return { type: "vimeo", videoId: vimeoId };

  if (!/^https?:\/\//i.test(trimmed)) return null;

  const kind = matchMediaKind(trimmed);
  if (kind) return { type: "file", url: trimmed, kind };

  return null;
}
