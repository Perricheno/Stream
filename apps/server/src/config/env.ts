import "dotenv/config";

export const env = {
  port: Number(process.env.PORT ?? 4000),
  botToken: process.env.BOT_TOKEN ?? "",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  /** Skips initData HMAC validation — for local dev only, before a real bot token exists. */
  devSkipAuth: process.env.DEV_SKIP_AUTH === "true",
};
