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
  // A phone's connection drops constantly (cell handoff, wifi switching,
  // the network just being bad for a few seconds) — giving up after only 3
  // tries turned an ordinary blip into "reconnect this manually" for the
  // user. socket.io's own backoff already caps the delay between attempts
  // (reconnectionDelayMax, 5s by default), so retrying indefinitely doesn't
  // mean hammering the server.
  reconnectionAttempts: Infinity,
});
