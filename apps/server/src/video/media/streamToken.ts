import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env";

/**
 * Short-lived bearer token authorising one viewer to stream one library
 * video. A `<video>` element can't attach the app's auth header, so the
 * stream URL carries this instead. The room-membership access check (see
 * http/videoLibraryRoutes.ts) happens once, when the token is minted — the
 * stream route then only verifies the signature and expiry.
 */

const TTL_SECONDS = 2 * 60 * 60;

// Derived from BOT_TOKEN so no extra config is needed wherever auth is real;
// falls back to SESSION_SECRET, then a fixed dev string (only reachable with
// DEV_SKIP_AUTH, where nothing is secret anyway).
const secret = createHash("sha256")
  .update(`stream-token:${env.botToken || env.sessionSecret || "dev-insecure"}`)
  .digest();

function sign(payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signStreamToken(videoId: string, userId: number): { token: string; expiresInSeconds: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${videoId}.${userId}.${expiresAt}`;
  return { token: `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`, expiresInSeconds: TTL_SECONDS };
}

export interface StreamTokenClaims {
  videoId: string;
  userId: number;
}

export function verifyStreamToken(token: string | undefined): StreamTokenClaims | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payloadB64 = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf-8");
  } catch {
    return null;
  }

  const expectedSig = sign(payload);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [videoId, userIdRaw, expiresAtRaw] = payload.split(".");
  const userId = Number(userIdRaw);
  const expiresAt = Number(expiresAtRaw);
  if (!videoId || !Number.isFinite(userId) || !Number.isFinite(expiresAt)) return null;
  if (Date.now() / 1000 > expiresAt) return null;

  return { videoId, userId };
}
