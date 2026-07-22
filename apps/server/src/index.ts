import { createServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@stream/shared";
import { createApp } from "./app";
import { env } from "./config/env";
import { getRoomCount } from "./rooms/RoomStore";
import { registerAuthMiddleware } from "./socket/auth";
import { registerSocketHandlers } from "./socket/registerSocketHandlers";
import type { SocketData } from "./socket/types";

const app = createApp();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  cors: { origin: env.corsOrigin },
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

httpServer.listen(env.port, () => {
  console.log(`Stream server listening on :${env.port}`);
  if (!env.botToken && !env.devSkipAuth) {
    console.warn("BOT_TOKEN is not set and DEV_SKIP_AUTH is not enabled — all socket connections will be rejected.");
  }
});
