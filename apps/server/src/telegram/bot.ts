import { createHash } from "node:crypto";
import { env } from "../config/env";
import { callBotApi } from "./botApi";

const GETUPDATES_TIMEOUT_SECONDS = 30;
const GETUPDATES_FETCH_TIMEOUT_MS = (GETUPDATES_TIMEOUT_SECONDS + 5) * 1000;
const POLL_ERROR_BACKOFF_MS = 3_000;
// The bot now only reacts to plain DMs (a pasted video link or an uploaded
// video file — see handleBotMessage), so `message` is the only update type
// worth asking Telegram for.
const ALLOWED_UPDATES = ["message"];

export const TELEGRAM_WEBHOOK_PATH = "/telegram/webhook";

export interface TelegramDocument {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramVideo {
  file_id: string;
  duration?: number;
  mime_type?: string;
  file_size?: number;
  file_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type?: string };
  from?: { id: number; is_bot?: boolean };
  text?: string;
  caption?: string;
  document?: TelegramDocument;
  video?: TelegramVideo;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

let pollingOffset = 0;
let stopped = false;

/**
 * Stable per-token value Telegram echoes back in the
 * X-Telegram-Bot-Api-Secret-Token header on every webhook POST, so the
 * public endpoint can reject requests that didn't actually come from
 * Telegram. Derived from the bot token instead of a separate env var —
 * nothing else needs to know it.
 */
export function webhookSecretToken(): string {
  return createHash("sha256").update(env.botToken).digest("hex");
}

/**
 * Handler for a single DM to the bot. Filled in by the download subsystem
 * (see registerBotMessageHandler) — kept as an injectable hook so bot.ts
 * stays free of any dependency on the video/download modules and the
 * polling/webhook plumbing here can be tested on its own.
 */
type BotMessageHandler = (message: TelegramMessage) => Promise<void>;
let messageHandler: BotMessageHandler | null = null;

export function registerBotMessageHandler(handler: BotMessageHandler): void {
  messageHandler = handler;
}

export async function processUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message || message.from?.is_bot) return;
  if (message.chat.type && message.chat.type !== "private") return;

  if (messageHandler) await messageHandler(message);
}

async function pollOnce(): Promise<void> {
  const updates = await callBotApi<TelegramUpdate[]>(
    "getUpdates",
    { offset: pollingOffset, timeout: GETUPDATES_TIMEOUT_SECONDS, allowed_updates: ALLOWED_UPDATES },
    GETUPDATES_FETCH_TIMEOUT_MS,
  );

  for (const update of updates) {
    pollingOffset = update.update_id + 1;
    try {
      await processUpdate(update);
    } catch (error) {
      console.error("[telegram-bot] failed to process update", update.update_id, error);
    }
  }
}

async function pollForever(): Promise<void> {
  await callBotApi("deleteWebhook", { drop_pending_updates: false }).catch(() => undefined);
  console.log("[telegram-bot] long polling started");

  while (!stopped) {
    try {
      await pollOnce();
    } catch (error) {
      console.error("[telegram-bot] getUpdates failed, retrying shortly", error);
      await new Promise((resolve) => setTimeout(resolve, POLL_ERROR_BACKOFF_MS));
    }
  }
}

/**
 * Registers `PUBLIC_URL + TELEGRAM_WEBHOOK_PATH` with Telegram when a public
 * tunnel URL is configured; otherwise falls back to long polling, which
 * needs no public URL and is friendlier for local dev without a tunnel up.
 */
export async function startTelegramBot(): Promise<void> {
  if (!env.botToken) return;

  await callBotApi("setMyCommands", {
    commands: [{ command: "start", description: "О боте" }],
  }).catch(() => undefined);

  if (env.publicUrl) {
    const url = `${env.publicUrl}${TELEGRAM_WEBHOOK_PATH}`;
    await callBotApi("setWebhook", { url, secret_token: webhookSecretToken(), allowed_updates: ALLOWED_UPDATES });
    console.log(`[telegram-bot] webhook registered at ${url}`);
    return;
  }

  await pollForever();
}

export function stopTelegramBot(): void {
  stopped = true;
}
