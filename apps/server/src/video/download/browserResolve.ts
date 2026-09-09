import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { env } from "../../config/env";

const RESOLVE_TIMEOUT_MS = 20_000;

// Matches an actual media response, not the page/script/image traffic a
// video site also generates while loading — the extension check catches
// direct files, the content-type check catches CDN URLs with no extension
// at all (common for signed/tokenized manifest URLs).
const MEDIA_URL_RE = /\.(mp4|m3u8|webm|mpd)(\?|$)/i;
const MEDIA_CONTENT_TYPE_RE = /^(video\/|audio\/mp4|application\/(x-mpegurl|vnd\.apple\.mpegurl|dash\+xml))/i;

/** True only for the specific "this extractor scrapes data_raw/initial-state
 *  out of the raw HTML, and the site now builds it client-side in JS
 *  instead" class of failure — not every yt-dlp error should pay for a
 *  browser launch. */
export function looksLikeClientRenderedFailure(message: string): boolean {
  const t = message.toLowerCase();
  return t.includes("unable to extract data_raw") || t.includes("unable to extract yandex");
}

/**
 * Last-resort fallback for an extractor that broke because the site moved
 * its player data into client-side JS: render the page in a real (headless)
 * browser and read the actual media URL off the network, exactly as a
 * viewer's browser would load it — sidesteps whatever changed in the page's
 * static HTML entirely, at the cost of a real browser launch per video.
 *
 * Returns a direct media URL that yt-dlp can download like any other direct
 * link (see downloadManager.ts's retry) — this never replaces yt-dlp, it
 * just finds the URL yt-dlp's own extractor failed to find.
 */
export async function resolveMediaUrlViaBrowser(pageUrl: string, signal: AbortSignal): Promise<string> {
  if (!env.chromiumPath || !existsSync(env.chromiumPath)) {
    throw new Error("no headless browser installed on the server for this fallback");
  }
  if (signal.aborted) throw new Error("cancelled");

  const browser = await chromium.launch({ executablePath: env.chromiumPath, headless: true });
  try {
    const page = await browser.newPage();
    const found = new Set<string>();

    page.on("response", (response) => {
      const url = response.url();
      // blob:/data: URLs are the <video> element's local MSE handle — real
      // network traffic never has one, and it only resolves inside this
      // browser session anyway, so it's useless to whatever downloads next.
      if (!/^https?:/i.test(url)) return;
      const contentType = response.headers()["content-type"] ?? "";
      if (MEDIA_URL_RE.test(url) || MEDIA_CONTENT_TYPE_RE.test(contentType)) found.add(url);
    });

    const onAbort = () => void browser.close();
    signal.addEventListener("abort", onAbort);
    try {
      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: RESOLVE_TIMEOUT_MS });
      // The player usually only starts its media request once it thinks it's
      // visible/interacted with — a real viewer's first paint, not something
      // domcontentloaded waits for on its own.
      await page.evaluate(() => document.querySelectorAll("video").forEach((v) => v.play().catch(() => undefined)));
      await page.waitForTimeout(Math.min(RESOLVE_TIMEOUT_MS, 8000));
    } finally {
      signal.removeEventListener("abort", onAbort);
    }

    if (signal.aborted) throw new Error("cancelled");
    if (found.size === 0) throw new Error("no media request seen while rendering the page");

    // A manifest (HLS/DASH) is what we actually want — yt-dlp downloads
    // every segment behind it itself. A bare .mp4/.webm response is only
    // useful if it's the *whole* file; picked as a last resort since a
    // fragmented player often makes several small range requests to the
    // same-looking URL that individually aren't the full video.
    const urls = [...found];
    return urls.find((u) => /\.(m3u8|mpd)(\?|$)/i.test(u)) ?? urls[0];
  } finally {
    await browser.close();
  }
}
