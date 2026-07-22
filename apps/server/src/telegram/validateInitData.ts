import { createHmac, timingSafeEqual } from "node:crypto";
import { INIT_DATA_MAX_AGE_SECONDS } from "@stream/shared";
import type { TelegramUser } from "@stream/shared";

export interface ValidatedInitData {
  user: TelegramUser;
  authDate: number;
}

/**
 * Validates Telegram's initData signature (HMAC-SHA256 over the sorted
 * "key=value" pairs, keyed by HMAC-SHA256("WebAppData", botToken)) per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initDataRaw: string, botToken: string): ValidatedInitData {
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get("hash");
  if (!hash) throw new Error("initData missing hash");
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const computedBuffer = Buffer.from(computedHash, "hex");
  const providedBuffer = Buffer.from(hash, "hex");
  if (computedBuffer.length !== providedBuffer.length || !timingSafeEqual(computedBuffer, providedBuffer)) {
    throw new Error("initData signature mismatch");
  }

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_SECONDS) {
    throw new Error("initData expired");
  }

  const userRaw = params.get("user");
  if (!userRaw) throw new Error("initData missing user");

  return { user: JSON.parse(userRaw) as TelegramUser, authDate };
}
