import { env } from "../config/env";
import { callBotApi } from "./botApi";

export interface InlineButton {
  text: string;
  url: string;
}

function replyMarkup(button?: InlineButton) {
  return button ? { inline_keyboard: [[{ text: button.text, url: button.url }]] } : undefined;
}

/**
 * Sends a message to a user via the Bot API. Only works if that user has
 * already started a conversation with the bot (Telegram restriction) — true
 * for anyone already in our `users` table, since that only happens after
 * they've opened the Mini App through the bot at least once.
 *
 * Returns the new message's id on success (so it can be edited later — see
 * editTelegramMessage), or null on any failure.
 */
export async function sendTelegramMessage(chatId: number, text: string, inlineButton?: InlineButton): Promise<number | null> {
  if (!env.botToken) return null;

  try {
    const message = await callBotApi<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup(inlineButton),
      disable_web_page_preview: true,
    });
    return message.message_id;
  } catch {
    // Timed out, or a network-level/API failure — a hung/failed request
    // shouldn't propagate as an unhandled rejection into the caller.
    return null;
  }
}

/** Edits a message previously sent by sendTelegramMessage. Cheap to call
 *  repeatedly, but Telegram rate-limits edits to the same message — callers
 *  streaming progress must throttle (see the bot's download handler). */
export async function editTelegramMessage(
  chatId: number,
  messageId: number,
  text: string,
  inlineButton?: InlineButton,
): Promise<boolean> {
  if (!env.botToken) return false;
  try {
    await callBotApi("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup(inlineButton),
      disable_web_page_preview: true,
    });
    return true;
  } catch {
    return false;
  }
}
