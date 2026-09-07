import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { apiRoutes } from "./http/apiRoutes";
import { videoStreamRoute } from "./http/videoStreamRoute";
import { telegramWebhookRoute } from "./http/telegramWebhookRoute";
import { TELEGRAM_WEBHOOK_PATH } from "./telegram/bot";

export function createApp(): Express {
  const app = express();
  // Tunnels (cloudflared/ngrok) and any reverse proxy terminate TLS and
  // forward plain HTTP, setting X-Forwarded-Proto — without this, req.secure
  // and req.protocol would always read "http" behind one, so the session
  // cookie's `secure` flag (see http/authRoutes.ts) would never be set even
  // when the site is genuinely only reachable over HTTPS.
  app.set("trust proxy", true);
  // credentials: true so the browser Telegram Login session cookie (see
  // http/session.ts) actually reaches the API — requires CORS_ORIGIN to be a
  // concrete origin rather than "*" once this is deployed publicly (the
  // Mini App path doesn't use cookies at all, so it's unaffected either way).
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(cookieParser());
  app.use(express.json());
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  // Mounted before the authenticated /api router: the video stream endpoint
  // authorises via a signed `?token=` query param (a <video> element can't
  // send the initData header), so it must not sit behind requireTelegramAuth.
  // Non-stream /api/videos/* paths fall through to apiRoutes below.
  app.use("/api/videos", videoStreamRoute);
  app.use("/api", apiRoutes);
  app.use(TELEGRAM_WEBHOOK_PATH, telegramWebhookRoute);
  return app;
}
