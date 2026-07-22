import { env } from "../config/env";

/**
 * Sends a message to a user via the Bot API. Only works if that user has
 * already started a conversation with the bot (Telegram restriction) — true
 * for anyone already in our `users` table, since that only happens after
 * they've opened the Mini App through the bot at least once.
 */
export async function sendTelegramMessage(
  chatId: number,
  text: string,
  inlineButton?: { text: string; url: string },
): Promise<boolean> {
  if (!env.botToken) return false;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  };
  if (inlineButton) {
    body.reply_markup = { inline_keyboard: [[{ text: inlineButton.text, url: inlineButton.url }]] };
  }

  const res = await fetch(`https://api.telegram.org/bot${env.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}
