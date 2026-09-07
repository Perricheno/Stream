import type { YouTubeSearchResult } from "@stream/shared";
import { env } from "../config/env";

interface YouTubeSearchApiItem {
  id: { videoId: string };
  snippet: { title: string; channelTitle: string; thumbnails: Record<string, { url: string }> };
}

interface YouTubeVideosApiItem {
  id: string;
  contentDetails: { duration: string };
}

/** ISO 8601 duration ("PT1H2M10S") -> "1:02:10" / "2:10". */
function formatIsoDuration(iso: string): string | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const parts = hours > 0 ? [hours, minutes.toString().padStart(2, "0")] : [minutes];
  return `${parts.join(":")}:${seconds.toString().padStart(2, "0")}`;
}

export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  if (!env.youtubeApiKey) throw new Error("YOUTUBE_API_KEY is not configured on the server");

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("maxResults", "12");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("key", env.youtubeApiKey);

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) throw new Error(`YouTube search failed (${searchRes.status})`);
  const searchBody = (await searchRes.json()) as { items?: YouTubeSearchApiItem[] };
  const items = searchBody.items ?? [];
  if (items.length === 0) return [];

  const videoIds = items.map((item) => item.id.videoId).join(",");
  const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videosUrl.searchParams.set("part", "contentDetails");
  videosUrl.searchParams.set("id", videoIds);
  videosUrl.searchParams.set("key", env.youtubeApiKey);

  const durationById = new Map<string, string | null>();
  const videosRes = await fetch(videosUrl);
  if (videosRes.ok) {
    const videosBody = (await videosRes.json()) as { items?: YouTubeVideosApiItem[] };
    for (const item of videosBody.items ?? []) {
      durationById.set(item.id, formatIsoDuration(item.contentDetails.duration));
    }
  }

  return items.map((item) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnailUrl:
      item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? "",
    durationText: durationById.get(item.id.videoId) ?? null,
  }));
}
