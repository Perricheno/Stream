import type { LibraryVideo, SiteSearchResult, VideoSource, YouTubeSearchResult } from "@stream/shared";
import { api } from "./apiClient";

export type { LibraryVideo } from "@stream/shared";

export function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  return api.get(`/video/search?q=${encodeURIComponent(query)}`);
}

export function searchSites(query: string): Promise<SiteSearchResult[]> {
  return api.get(`/video/search-sites?q=${encodeURIComponent(query)}`);
}

/**
 * Turns a pasted link into a playable source. A directly playable link
 * (YouTube/Vimeo/direct file) comes back as that source; anything else
 * (a tube site, a Google Drive share, a page that only embeds a player) is
 * handed to the download subsystem and comes back as a `library` source
 * whose row starts out downloading — the player then shows import progress.
 */
export async function resolveVideo(url: string): Promise<VideoSource> {
  const res = await api.post<{ source: VideoSource } | { needsDownload: true }>("/video/resolve", { url });
  if ("source" in res) return res.source;

  const { video } = await api.post<{ video: LibraryVideo }>("/videos/import", { url });
  return { type: "library", videoId: video.id, title: video.title || undefined };
}

/** The current user's ready-to-play library (own downloads only). */
export function listVideos(): Promise<LibraryVideo[]> {
  return api.get("/videos");
}

export function getVideo(id: string): Promise<LibraryVideo> {
  return api.get(`/videos/${id}`);
}

/** Absolute path for a <video> element's `src` — note this bypasses the
 *  apiClient (`<video>` can't send auth headers), hence the signed token. */
export function getStreamUrl(id: string, token: string): string {
  return `/api/videos/${id}/stream?token=${encodeURIComponent(token)}`;
}
