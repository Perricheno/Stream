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
      return fetch(proxied);
    }

    return env.ASSETS.fetch(request);
  },
};
