import type { NextFunction, Request, Response } from "express";
import { validateInitData } from "../telegram/validateInitData";
import { env } from "../config/env";
import { upsertUser } from "../db/userRepository";
import type { SocketUser } from "../socket/types";
import "./types";

/**
 * Express counterpart to socket/auth.ts's middleware — same initData
 * validation, read from the `X-Init-Data` header instead of a socket
 * handshake. Ensures the user row exists (upsert) so profile/friends
 * lookups always have something to work with.
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
  if (!initDataRaw || !env.botToken) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    const { user } = validateInitData(initDataRaw, env.botToken);
    const socketUser: SocketUser = { id: user.id, firstName: user.first_name, photoUrl: user.photo_url };
    upsertUser(socketUser);
    req.telegramUser = socketUser;
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
}
