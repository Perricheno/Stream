import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import {
  matchMediaKind,
  matchVimeoId,
  matchYoutubeId,
  type VideoSource
} from "@stream/shared";
import { assertPublicHttpUrl, pinnedPublicLookup } from "./ssrfGuard";
import { isAdUrl } from "./adDomains";


const MAX_BODY_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;
const MAX_RESOLVE_DEPTH = 2;

const META_VIDEO_KEYS = new Set([
  "og:video",
  "og:video:url",
  "og:video:secure_url",
  "twitter:player",
  "twitter:player:stream",
]);

interface FetchedPage {
  body: string;
  contentType: string;
  finalUrl: string;
}

/**
 * Given anything a user might paste, figures out what — if anything — can be
 * played *directly*: a YouTube/Vimeo link, a direct .mp4/.m3u8 link, or a web
 * page that embeds one of those. Returns null when nothing directly playable
 * was found — the caller then hands the link to the download subsystem
 * (yt-dlp / Google Drive), which covers tube sites, VK, and everything else
 * that used to fall back to a sync-less iframe.
 */
export async function resolveVideoUrl(rawUrl: string): Promise<VideoSource | null> {
  return resolveInner(rawUrl.trim(), 0);
}

async function resolveInner(rawUrl: string, depth: number): Promise<VideoSource | null> {
  if (!rawUrl || depth > MAX_RESOLVE_DEPTH) return null;

  // 1. Быстрая проверка YouTube
  const youtubeId = matchYoutubeId(rawUrl);
  if (youtubeId) return { type: "youtube", videoId: youtubeId };

  // 2. Быстрая проверка Vimeo
  const vimeoId = matchVimeoId(rawUrl);
  if (vimeoId) return { type: "vimeo", videoId: vimeoId };

  // 3. Прямые ссылки на файлы
  const extensionKind = matchMediaKind(rawUrl);
  if (extensionKind) return { type: "file", url: rawUrl, kind: extensionKind };

  if (!/^https?:\/\//i.test(rawUrl)) return null;

  // Если ничего не подошло сразу, пробуем загрузить страницу и найти эмбед там
  const page = await fetchPage(rawUrl).catch((err) => {
    // Swallowed on purpose (an unreachable page or a blocked private host is
    // ordinary, expected input, not a bug) — but logged, so it's
    // distinguishable from "genuinely no video found" and from an actual bug
    // in fetchPage itself, neither of which should look identical to this.
    console.error(`[resolveVideoUrl] fetchPage("${rawUrl}") failed:`, err instanceof Error ? err.message : err);
    return null;
  });
  if (!page) return null;

  if (page.contentType.includes("mpegurl")) return { type: "file", url: page.finalUrl, kind: "hls" };
  if (page.contentType.startsWith("video/")) return { type: "file", url: page.finalUrl, kind: "mp4" };
  if (!page.contentType.includes("html")) return null;

  const candidates = extractCandidates(page.body, page.finalUrl);

  for (const candidate of candidates) {
    const ytId = matchYoutubeId(candidate);
    if (ytId) return { type: "youtube", videoId: ytId };

    const vId = matchVimeoId(candidate);
    if (vId) return { type: "vimeo", videoId: vId };

    const kind = matchMediaKind(candidate);
    if (kind) return { type: "file", url: candidate, kind };
  }

  // The page loaded but exposed nothing directly playable (only a
  // proprietary embedded player, or a JS-built one). Not an error — the
  // caller falls through to the download subsystem, which can still pull it.
  return null;
}

async function fetchPage(startUrl: string): Promise<FetchedPage | null> {
  let currentUrl = startUrl;

  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    // Validates the URL/protocol and gives a fast, clear error for an
    // obviously-private host — the actual enforcement is pinnedPublicLookup
    // below, which the request itself uses to resolve, so there's no gap
    // between "checked" and "connected to".
    const url = await assertPublicHttpUrl(currentUrl);
    const hopResult = await fetchOnce(url);

    if (hopResult.redirectLocation) {
      currentUrl = new URL(hopResult.redirectLocation, url).toString();
      continue;
    }
    if (!hopResult.ok) return null;

    return { body: hopResult.body, contentType: hopResult.contentType, finalUrl: url.toString() };
  }

  return null;
}

interface HopResult {
  ok: boolean;
  contentType: string;
  body: string;
  redirectLocation: string | null;
}

/**
 * Single-hop fetch via node:http(s) instead of the global fetch — the
 * `lookup` option lets us pin the DNS resolution used for the actual TCP
 * connection to the same, already-validated address (see pinnedPublicLookup
 * in ssrfGuard.ts), which a fetch()-based implementation can't do.
 */
function fetchOnce(url: URL): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = requestFn(
      url,
      {
        method: "GET",
        lookup: pinnedPublicLookup,
        timeout: FETCH_TIMEOUT_MS,
        headers: {
          // A self-identifying bot UA gets flatly blocked (403/connection
          // reset) by ordinary bot/WAF protection on a lot of real sites —
          // this is what a real browser sends, for pages any visitor could
          // otherwise load fine.
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;

        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ ok: false, contentType: "", body: "", redirectLocation: res.headers.location ?? null });
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          resolve({ ok: false, contentType: "", body: "", redirectLocation: null });
          return;
        }

        const contentType = res.headers["content-type"] ?? "";
        if (!contentType.includes("html")) {
          res.resume();
          resolve({ ok: true, contentType, body: "", redirectLocation: null });
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve({ ok: true, contentType, body: Buffer.concat(chunks).toString("utf-8"), redirectLocation: null });
        };

        res.on("data", (chunk: Buffer) => {
          if (settled) return;
          const remaining = MAX_BODY_BYTES - total;
          if (remaining <= 0) {
            res.destroy();
            finish();
            return;
          }
          const slice = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
          chunks.push(slice);
          total += slice.byteLength;
          if (total >= MAX_BODY_BYTES) {
            res.destroy();
            finish();
          }
        });
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", finish);
      },
    );

    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.end();
  });
}

function resolveUrl(candidate: string, baseUrl: string): string | null {
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractCandidates(html: string, baseUrl: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (raw: string | undefined | null) => {
    if (!raw) return;
    const resolved = resolveUrl(raw, baseUrl);
    if (!resolved || seen.has(resolved) || isAdUrl(resolved)) return;
    seen.add(resolved);
    ordered.push(resolved);
  };

  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tagStr = tag[0];
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tagStr)?.[1]?.toLowerCase();
    const content = /content\s*=\s*["']([^"']+)["']/i.exec(tagStr)?.[1];
    if (key && content && META_VIDEO_KEYS.has(key)) push(content);
  }

  for (const script of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(script[1]);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        const items = Array.isArray(node?.["@graph"]) ? node["@graph"] : [node];
        for (const item of items) {
          if (item?.["@type"] === "VideoObject") {
            push(item.contentUrl);
            push(item.embedUrl);
          }
        }
      }
    } catch { }
  }

  for (const m of html.matchAll(/<video\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) push(m[1]);
  for (const m of html.matchAll(/<source\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) push(m[1]);
  for (const m of html.matchAll(/<iframe\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) push(m[1]);
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/gi)) push(m[0]);
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/gi)) push(m[0]);

  return ordered;
}