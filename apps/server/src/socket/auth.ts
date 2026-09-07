import { parseCookie } from "cookie";
import type { Server } from "socket.io";
import { validateInitData } from "../telegram/validateInitData";
import { env } from "../config/env";
import { upsertUser } from "../db/userRepository";
import { SESSION_COOKIE_NAME, verifySessionToken } from "../http/session";
import type { SocketUser } from "./types";

/**
 * Rejects the socket connection outright unless initData validates — see
 * validateInitData.ts — or, for a browser visitor outside Telegram, unless
 * the session cookie from a completed Telegram Login validates instead (see
 * http/session.ts and http/authRoutes.ts). `DEV_SKIP_AUTH=true` bypasses all
 * of this before a real bot token exists, assigning each connection a
 * distinct throwaway identity so local multi-tab testing still shows
 * separate participants.
 */
export function registerAuthMiddleware(io: Server): void {
  io.use((socket, next) => {
    if (env.devSkipAuth) {
      const fallbackId = Math.floor(Math.random() * 1_000_000) + 1000;
      const user: SocketUser = { id: fallbackId, firstName: `Guest ${fallbackId}` };
      upsertUser(user);
      socket.data.user = user;
      next();
      return;
    }

    const initDataRaw = socket.handshake.auth?.initData as string | undefined;
    if (initDataRaw && env.botToken) {
      try {
        const { user } = validateInitData(initDataRaw, env.botToken);
        const socketUser: SocketUser = { id: user.id, firstName: user.first_name, photoUrl: user.photo_url };
        upsertUser(socketUser);
        socket.data.user = socketUser;
        next();
      } catch {
        next(new Error("unauthorized"));
      }
      return;
    }

    const cookieHeader = socket.handshake.headers.cookie;
    const sessionToken = cookieHeader ? parseCookie(cookieHeader)[SESSION_COOKIE_NAME] : undefined;
    void verifySessionToken(sessionToken).then((sessionUser) => {
      if (!sessionUser) {
        next(new Error("unauthorized"));
        return;
      }
      upsertUser(sessionUser);
      socket.data.user = sessionUser;
      next();
    });
  });
}
