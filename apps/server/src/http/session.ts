import { jwtVerify, SignJWT } from "jose";
import { env } from "../config/env";
import type { SocketUser } from "../socket/types";

export const SESSION_COOKIE_NAME = "stream_session";

/** How long a browser Telegram Login stays signed in before needing to re-auth. */
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret);
}

/**
 * Mints this app's own session token for a browser visitor who just completed
 * Telegram Login (see validateTelegramLoginToken.ts) — everything downstream
 * of auth (RoomStore, friendRepository, userRepository) only ever sees a
 * SocketUser, the same shape the Mini App's initData path already produces,
 * so it never needs to know which login path was used.
 */
export async function createSessionToken(user: SocketUser): Promise<string> {
  return new SignJWT({ firstName: user.firstName, photoUrl: user.photoUrl ?? null })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Returns the session's user, or null if the token is missing/invalid/expired. */
export async function verifySessionToken(token: string | undefined): Promise<SocketUser | null> {
  if (!token || !env.sessionSecret) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const id = Number(payload.sub);
    if (!Number.isInteger(id)) return null;
    return {
      id,
      firstName: typeof payload.firstName === "string" ? payload.firstName : "",
      photoUrl: typeof payload.photoUrl === "string" ? payload.photoUrl : undefined,
    };
  } catch {
    return null;
  }
}
