import { Router } from "express";
import { DISPLAY_NAME_MAX_LENGTH } from "@stream/shared";
import { env } from "../config/env";
import { getProfile, getUserBasics, updateProfile } from "../db/userRepository";
import { addFriendship, listFriends } from "../db/friendRepository";
import { getRoom } from "../rooms/RoomStore";
import { sendTelegramMessage } from "../telegram/sendTelegramMessage";
import { requireTelegramAuth } from "./requireTelegramAuth";
import "./types";

export const apiRoutes = Router();
apiRoutes.use(requireTelegramAuth);

apiRoutes.get("/profile", (req, res) => {
  const profile = getProfile(req.telegramUser!.id);
  res.json(profile);
});

apiRoutes.patch("/profile", (req, res) => {
  const userId = req.telegramUser!.id;
  const body = req.body as Record<string, unknown>;

  const patch: Parameters<typeof updateProfile>[1] = {};
  if (typeof body.displayName === "string") patch.displayName = body.displayName.trim().slice(0, DISPLAY_NAME_MAX_LENGTH);
  if (typeof body.hideProfile === "boolean") patch.hideProfile = body.hideProfile;
  if (typeof body.notificationsEnabled === "boolean") patch.notificationsEnabled = body.notificationsEnabled;
  if (typeof body.autoplay === "boolean") patch.autoplay = body.autoplay;
  if (body.language === "ru" || body.language === "en") patch.language = body.language;

  const updated = updateProfile(userId, patch);
  if (!updated) {
    res.status(404).json({ error: "profile not found" });
    return;
  }
  res.json(updated);
});

apiRoutes.get("/friends", (req, res) => {
  res.json(listFriends(req.telegramUser!.id));
});

apiRoutes.post("/friends/add", (req, res) => {
  const userId = req.telegramUser!.id;
  const friendUserId = Number((req.body as Record<string, unknown>).friendUserId);

  if (!Number.isInteger(friendUserId) || friendUserId <= 0) {
    res.status(400).json({ error: "invalid friendUserId" });
    return;
  }
  if (friendUserId === userId) {
    res.status(400).json({ error: "cannot add yourself" });
    return;
  }
  if (!getUserBasics(friendUserId)) {
    res.status(404).json({ error: "that user hasn't opened Stream yet" });
    return;
  }

  addFriendship(userId, friendUserId);
  res.json(listFriends(userId));
});

apiRoutes.post("/rooms/:roomId/invite", async (req, res) => {
  const userId = req.telegramUser!.id;
  const roomId = req.params.roomId.toUpperCase();
  const friendUserId = Number((req.body as Record<string, unknown>).friendUserId);

  if (!Number.isInteger(friendUserId) || friendUserId <= 0) {
    res.status(400).json({ error: "invalid friendUserId" });
    return;
  }
  if (!getRoom(roomId)) {
    res.status(404).json({ error: "room not found" });
    return;
  }
  if (!env.botUsername) {
    res.status(503).json({ error: "BOT_USERNAME is not configured on the server" });
    return;
  }

  const inviterName = getUserBasics(userId)?.firstName ?? "Друг";
  const url = `https://t.me/${env.botUsername}?startapp=room_${roomId}`;
  const sent = await sendTelegramMessage(friendUserId, `${inviterName} приглашает вас посмотреть видео вместе!`, {
    text: "Присоединиться",
    url,
  });

  if (!sent) {
    res.status(502).json({ error: "failed to send invite (friend may not have started the bot)" });
    return;
  }
  res.json({ ok: true });
});
