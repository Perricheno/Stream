import { Router } from "express";
import { env } from "../config/env";
import { createAuthRequest, deleteAuthRequest, readAuthRequest } from "../db/authRequestRepository";
import { upsertUser } from "../db/userRepository";
import { validateTelegramLoginToken } from "../telegram/validateTelegramLoginToken";
import { createSessionToken, SESSION_COOKIE_NAME } from "./session";

/**
 * Unauthenticated by design — mounted before apiRoutes' requireTelegramAuth
 * middleware (see apiRoutes.ts). This is the standalone-website counterpart
 * to the Mini App's initData handshake: a browser visitor outside Telegram
 * has no initData to send, so they establish identity here instead, via
 * Telegram's own Login widget (see oath.txt / apps/web/src/auth).
 */
export const authRoutes = Router();

const SESSION_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

authRoutes.post("/telegram-login", async (req, res) => {
  if (!env.telegramBotId || !env.sessionSecret) {
    res.status(503).json({ error: "web login is not configured on the server" });
    return;
  }

  const idToken = (req.body as Record<string, unknown>)?.idToken;
  if (typeof idToken !== "string" || !idToken) {
    res.status(400).json({ error: "missing idToken" });
    return;
  }

  try {
    const user = await validateTelegramLoginToken(idToken);
    const socketUser = { id: user.id, firstName: user.first_name, photoUrl: user.photo_url };
    upsertUser(socketUser);
    const token = await createSessionToken(socketUser);

    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: req.protocol === "https",
      sameSite: "lax",
      maxAge: SESSION_COOKIE_MAX_AGE_MS,
      path: "/",
    });
    res.json({ ok: true, user: socketUser });
  } catch (err) {
    console.warn("[auth] Telegram Login verification failed:", err);
    res.status(401).json({ error: "invalid Telegram Login token" });
  }
});

authRoutes.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

/**
 * Browser login without Telegram's Login Widget.
 *
 * The widget (and the OIDC flow) only work from an origin pre-registered
 * with @BotFather, which is fiddly and fails opaquely with "origin required".
 * This path needs none of that: mint a one-time token, send the visitor to
 * the bot with it, and let the bot vouch for them. The bot already knows who
 * they are — that's the whole trust anchor.
 *
 *   POST /link  -> { token, deepLink }   open deepLink, then poll
 *   GET  /poll  -> pending | completed | expired  (sets the session cookie)
 */
authRoutes.post("/link", (_req, res) => {
  if (!env.botUsername) {
    res.status(503).json({ error: "BOT_USERNAME is not configured on the server" });
    return;
  }
  const token = createAuthRequest();
  res.json({ token, deepLink: `https://t.me/${env.botUsername}?start=${token}` });
});

authRoutes.get("/poll", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    res.status(400).json({ error: "missing token" });
    return;
  }

  const state = readAuthRequest(token);
  if (state.status !== "completed") {
    res.json({ status: state.status });
    return;
  }

  const user = { id: state.user.id, firstName: state.user.first_name, photoUrl: state.user.photo_url };
  upsertUser(user);
  const sessionToken = await createSessionToken(user);
  // One session per token — a replayed deep link must not mint another.
  deleteAuthRequest(token);

  res.cookie(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: req.protocol === "https",
    sameSite: "lax",
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
    path: "/",
  });
  res.json({ status: "completed", user });
});
