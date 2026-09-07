import { createRemoteJWKSet, jwtVerify } from "jose";
import type { TelegramUser } from "@stream/shared";
import { env } from "../config/env";

const TELEGRAM_OIDC_ISSUER = "https://oauth.telegram.org";

/** Cached across requests — createRemoteJWKSet handles its own fetch caching
 *  and re-fetches only when it meets a `kid` it doesn't recognize yet. */
const jwks = createRemoteJWKSet(new URL(`${TELEGRAM_OIDC_ISSUER}/.well-known/jwks.json`));

interface TelegramLoginClaims {
  id: number;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

/**
 * Verifies the `id_token` returned by Telegram's Login widget (the OIDC flow
 * described in oath.txt) — signature via Telegram's published JWKS, plus
 * issuer/audience/expiry. Maps its claims onto the same TelegramUser shape
 * validateInitData.ts produces for the Mini App path, so both converge on one
 * identity type for everything downstream.
 */
export async function validateTelegramLoginToken(idToken: string): Promise<TelegramUser> {
  if (!env.telegramBotId) throw new Error("TELEGRAM_BOT_ID is not configured on the server");

  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: TELEGRAM_OIDC_ISSUER,
    audience: env.telegramBotId,
  });

  const claims = payload as unknown as TelegramLoginClaims;
  if (!Number.isInteger(claims.id)) throw new Error("id_token missing user id");

  return {
    id: claims.id,
    first_name: claims.given_name || claims.name || "User",
    last_name: claims.family_name,
    photo_url: claims.picture,
  };
}
