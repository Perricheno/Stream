import { io, type Socket } from "socket.io-client";
import { initData } from "@telegram-apps/sdk-react";
import type { ClientToServerEvents, ServerToClientEvents } from "@stream/shared";
import { getRawInitData } from "../telegram/rawInitData";

// Same-origin by default (works with the Vite dev proxy for /socket.io, and
// with a single-hostname tunnel) — set VITE_SERVER_URL only if the backend
// is reachable at a different origin than the frontend.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

export type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: RoomSocket = io(SERVER_URL, {
  autoConnect: false,
  // Prefer the SDK's parsed initData; fall back to reading the URL hash
  // ourselves if the SDK's stricter parser rejected otherwise-valid data.
  auth: (cb) => cb({ initData: initData.raw() || getRawInitData() || "" }),
  reconnectionAttempts: 3,
});
