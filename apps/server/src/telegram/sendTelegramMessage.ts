import { env } from "../config/env";
import { callBotApi, callBotApiMultipart, TelegramApiError } from "./botApi";

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

export type SendVideoResult = { ok: true } | { ok: false; tooLarge: boolean; reason: string };

/**
 * Sends an actual downloaded video file to the user as a Telegram video
 * message — the point of the bot being a "downloader": you get the file
 * itself in the chat, not just a link. Distinguishes "too large for the
 * current Bot API" from other failures so the caller can explain that
 * specifically (raising it needs a Local Bot API Server, see deploy/).
 */
export async function sendTelegramVideoFile(chatId: number, filePath: string, caption?: string): Promise<SendVideoResult> {
  if (!env.botToken) return { ok: false, tooLarge: false, reason: "bot not configured" };

  try {
    await callBotApiMultipart(
      "sendVideo",
      { chat_id: String(chatId), caption: caption ?? "", supports_streaming: "true" },
      { field: "video", path: filePath },
    );
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const tooLarge = err instanceof TelegramApiError && /too large|entity too large|413/i.test(message);
    console.error("[bot] sendVideo failed:", message);
    return { ok: false, tooLarge, reason: message };
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
