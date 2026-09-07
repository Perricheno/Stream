import { Router } from "express";
import { processUpdate, webhookSecretToken, type TelegramUpdate } from "../telegram/bot";

export const telegramWebhookRoute = Router();

telegramWebhookRoute.post("/", (req, res) => {
  if (req.get("X-Telegram-Bot-Api-Secret-Token") !== webhookSecretToken()) {
    res.sendStatus(401);
    return;
  }

  // Telegram expects an immediate 200 and will retry on timeout — the
  // animation an update triggers can run for many seconds, so it must not
  // hold up the response.
  res.sendStatus(200);

  void processUpdate(req.body as TelegramUpdate).catch((error) => {
    console.error("[telegram-bot] failed to process webhook update", error);
  });
});
