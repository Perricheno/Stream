import { createServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@stream/shared";
import { createApp } from "./app";
import { env } from "./config/env";
import { getRoomCount } from "./rooms/RoomStore";
import { registerAuthMiddleware } from "./socket/auth";
import { registerSocketHandlers } from "./socket/registerSocketHandlers";
import type { SocketData } from "./socket/types";
import { reconcileInterruptedDownloads } from "./video/download/downloadManager";
import { registerBotMessageHandler, startTelegramBot } from "./telegram/bot";
import { handleBotMessage } from "./telegram/botDownloadHandler";

const app = createApp();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  // credentials: true so the session cookie from a browser Telegram Login
  // (see http/session.ts) reaches the handshake if frontend/backend ever end
  // up on different origins — same requirement as app.ts's Express CORS.
  cors: { origin: env.corsOrigin, credentials: true },
  // Defaults (25s interval / 20s timeout) mean a connection that silently
  // died — a phone's OS suspending the network stack while the app is
  // backgrounded is the common case here — can take up to ~45s to be
  // noticed by either side. During that window the client still believes
  // it's connected, so nothing re-syncs and nothing the user does actually
  // reaches the server. Tighter values catch it in ~18s instead.
  pingInterval: 10_000,
  pingTimeout: 8_000,
});

registerAuthMiddleware(io);
registerSocketHandlers(io);

/** Richer status for the client's service-status indicator (see apps/web/src/status). */
app.get("/status", (_req, res) => {
  res.json({
    ok: true,
    uptimeSeconds: process.uptime(),
    connectedSockets: io.engine.clientsCount,
    activeRooms: getRoomCount(),
  });
});

// Any video row still 'downloading' is a leftover from a previous process —
// fail it so its UI stops spinning (nothing resumes an interrupted job).
reconcileInterruptedDownloads();

httpServer.listen(env.port, () => {
  console.log(`Stream server listening on :${env.port}`);
  if (!env.botToken && !env.devSkipAuth) {
    console.warn("BOT_TOKEN is not set and DEV_SKIP_AUTH is not enabled — all socket connections will be rejected.");
  }
});

// The bot DMs a video link or file → download subsystem → "saved" with a
// deep link back into the Mini App. No-op if BOT_TOKEN isn't set.
registerBotMessageHandler(handleBotMessage);
void startTelegramBot();
