export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  /** Formatted "m:ss" / "h:mm:ss", already ISO-8601-parsed server-side. */
  durationText: string | null;
}

export interface SiteSearchResult {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  thumbnailUrl: string | null;
}
