import type { SiteSearchResult } from "@stream/shared";
import { env } from "../config/env";

interface GoogleCseItem {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  pagemap?: { cse_thumbnail?: { src: string }[]; cse_image?: { src: string }[] };
}

export async function searchSites(query: string): Promise<SiteSearchResult[]> {
  if (!env.googleApiKey || !env.googleCseId) {
    throw new Error("GOOGLE_API_KEY / GOOGLE_CSE_ID are not configured on the server");
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", env.googleApiKey);
  url.searchParams.set("cx", env.googleCseId);
  url.searchParams.set("num", "10");
  url.searchParams.set("q", query);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google search failed (${res.status})`);
  const body = (await res.json()) as { items?: GoogleCseItem[] };

  return (body.items ?? []).map((item) => ({
    title: item.title,
    link: item.link,
    snippet: item.snippet,
    displayLink: item.displayLink,
    thumbnailUrl: item.pagemap?.cse_thumbnail?.[0]?.src ?? item.pagemap?.cse_image?.[0]?.src ?? null,
  }));
}
