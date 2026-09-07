import type { NextFunction, Request, Response } from "express";
import { validateInitData } from "../telegram/validateInitData";
import { env } from "../config/env";
import { upsertUser } from "../db/userRepository";
import type { SocketUser } from "../socket/types";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session";
import "./types";

/**
 * Express counterpart to socket/auth.ts's middleware. Tries the Mini App's
 * initData header first (unchanged); a browser visitor outside Telegram has
 * none of that, so falls back to the session cookie a successful Telegram
 * Login mints (see authRoutes.ts). Either path ends up upserting the same
 * user row so profile/friends lookups always have something to work with.
 */
export function requireTelegramAuth(req: Request, res: Response, next: NextFunction): void {
  if (env.devSkipAuth) {
    const fallbackId = Number(req.header("X-Dev-User-Id")) || 1000;
    const user: SocketUser = { id: fallbackId, firstName: `Guest ${fallbackId}` };
    upsertUser(user);
    req.telegramUser = user;
    next();
    return;
  }

  const initDataRaw = req.header("X-Init-Data");
  if (initDataRaw && env.botToken) {
    try {
      const { user } = validateInitData(initDataRaw, env.botToken);
      const socketUser: SocketUser = { id: user.id, firstName: user.first_name, photoUrl: user.photo_url };
      upsertUser(socketUser);
      req.telegramUser = socketUser;
      next();
      return;
    } catch {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
  }

  void verifySessionToken(req.cookies?.[SESSION_COOKIE_NAME]).then((sessionUser) => {
    if (!sessionUser) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    upsertUser(sessionUser);
    req.telegramUser = sessionUser;
    next();
  });
}
