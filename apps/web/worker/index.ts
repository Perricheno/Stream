/**
 * Serves the built Mini App and reverse-proxies dynamic paths to the VPS
 * backend. The browser only ever sees this Worker's origin, so:
 *  - the frontend keeps using origin-relative URLs (`/api/...`, `/socket.io`)
 *    with no `VITE_SERVER_URL` and no CORS,
 *  - the Telegram Login session cookie is a plain same-origin cookie,
 *  - Socket.io's WebSocket upgrade is passed straight through.
 */

interface Env {
  ASSETS: Fetcher;
  /** VPS backend origin, e.g. https://api.perricheno.com */
  ORIGIN_URL: string;
}

// Everything the Express/Socket.io server owns. Anything else is a static asset.
const PROXIED_PREFIXES = ["/api/", "/socket.io", "/status", "/telegram/", "/health"];
/** Video bytes — cacheable at the edge, unlike every other proxied path. */
const VIDEO_STREAM_RE = /^\/api\/videos\/[^/]+\/stream$/;
const VIDEO_EDGE_TTL_SECONDS = 604800; // 7 days; the bytes behind an id never change

function isProxied(pathname: string): boolean {
  return PROXIED_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (isProxied(url.pathname)) {
      const origin = new URL(env.ORIGIN_URL);
      const target = new URL(url.pathname + url.search, origin);
      // Reuse the incoming request (method, headers, body, and the
      // Upgrade: websocket header for socket.io) against the backend origin.
      const proxied = new Request(target, request);
      proxied.headers.set("X-Forwarded-Host", url.host);
      proxied.headers.set("X-Forwarded-Proto", "https");

      if (VIDEO_STREAM_RE.test(url.pathname)) {
        // Hold the file at the edge. Without this every seek and every
        // buffer refill is a round trip to the origin server, which turns
        // playback into a slideshow whenever that server is far away.
        // The signed token stays in the cache key (it's part of the URL), so
        // caching doesn't widen who can fetch the bytes.
        return fetch(proxied, {
          cf: { cacheEverything: true, cacheTtl: VIDEO_EDGE_TTL_SECONDS },
        } as RequestInit);
      }

      return fetch(proxied);
    }

    return env.ASSETS.fetch(request);
  },
};
