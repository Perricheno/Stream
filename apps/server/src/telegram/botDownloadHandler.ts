import type { VideoImportSourceType } from "@stream/shared";
import { env } from "../config/env";
import { completeAuthRequest } from "../db/authRequestRepository";
import { createVideo, getVideo } from "../db/videoRepository";
import { classifyImport } from "../video/download/importSource";
import { enqueueImport, onDownloadProgress, TELEGRAM_UPLOAD_REF_PREFIX } from "../video/download/downloadManager";
import { probe } from "../video/download/probe";
import { assertPublicHttpUrl } from "../video/ssrfGuard";
import type { TelegramDocument, TelegramMessage } from "./bot";
import { editTelegramMessage, sendTelegramMessage, sendTelegramVideoFile } from "./sendTelegramMessage";

const WELCOME =
  "Пришли мне ссылку на видео (YouTube, VK, тюб-сайты, Google Drive — что угодно) или сам видеофайл. " +
  "Я скачаю его на сервер и подготовлю для совместного просмотра — потом сможешь открыть его в Stream и смотреть вместе с друзьями в синхроне.";

const URL_RE = /\bhttps?:\/\/\S+/i;
const VIDEO_DOC_EXT_RE = /\.(mp4|mkv|webm|mov|m4v|avi|ts|m2ts|flv)$/i;
const EDIT_THROTTLE_MS = 2500;
// Stop listening for progress on a job that's clearly never going to finish.
const PROGRESS_LISTEN_TIMEOUT_MS = 45 * 60 * 1000;

function isVideoDocument(doc: TelegramDocument | undefined): doc is TelegramDocument {
  if (!doc) return false;
  return (doc.mime_type ?? "").startsWith("video/") || VIDEO_DOC_EXT_RE.test(doc.file_name ?? "");
}

function watchVideoUrl(videoId: string): string | undefined {
  return env.botUsername ? `https://t.me/${env.botUsername}?startapp=video_${videoId}` : undefined;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const PROGRESS_BAR_LENGTH = 12;

/** A block-character progress bar for the chat message — Telegram has no
 *  native progress widget, so this is the closest thing to a visual bar. */
function renderProgressBar(percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * PROGRESS_BAR_LENGTH);
  return "▓".repeat(filled) + "░".repeat(PROGRESS_BAR_LENGTH - filled);
}

/** Single DM handler wired into the bot via registerBotMessageHandler. */
export async function handleBotMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const userId = message.from?.id;
  if (!userId) return;

  const text = (message.text ?? message.caption ?? "").trim();

  const startMatch = /^\/start(?:@\S+)?(?:\s+(\S+))?/i.exec(text);
  if (startMatch) {
    // `/start <token>` is the website's login handshake: the browser minted
    // the token and is polling for it, and the bot vouching for who sent this
    // message is the whole trust anchor (see http/authRoutes.ts).
    const token = startMatch[1];
    if (token) {
      const claimed = completeAuthRequest(token, {
        id: userId,
        first_name: message.from?.first_name ?? "User",
        last_name: message.from?.last_name,
        username: message.from?.username,
      });
      await sendTelegramMessage(
        chatId,
        claimed
          ? "✅ Вход подтверждён — возвращайся на вкладку с сайтом, она уже открывается."
          : "⚠️ Ссылка для входа устарела или уже использована. Открой сайт и нажми «Войти» заново.",
      );
      return;
    }
    await sendTelegramMessage(chatId, WELCOME);
    return;
  }

  if (/^\/help\b/i.test(text)) {
    await sendTelegramMessage(chatId, WELCOME);
    return;
  }

  const file = message.video ?? (isVideoDocument(message.document) ? message.document : undefined);
  if (file) {
    await startImport({
      chatId,
      userId,
      sourceType: "telegram_upload",
      ref: `${TELEGRAM_UPLOAD_REF_PREFIX}${file.file_id}`,
      titleHint: file.file_name,
    });
    return;
  }

  const url = text.match(URL_RE)?.[0]?.replace(/[)\]}.,]+$/, "");
  if (!url) {
    await sendTelegramMessage(chatId, "Не вижу ссылки. Пришли ссылку на видео или сам видеофайл — и я его скачаю.");
    return;
  }

  try {
    await assertPublicHttpUrl(url);
  } catch {
    await sendTelegramMessage(chatId, "Эту ссылку не получится открыть — она ведёт на внутренний адрес.");
    return;
  }

  const { sourceType } = classifyImport(url);
  await startImport({ chatId, userId, sourceType, ref: url });
}

interface StartImportArgs {
  chatId: number;
  userId: number;
  sourceType: VideoImportSourceType;
  ref: string;
  titleHint?: string;
}

async function startImport({ chatId, userId, sourceType, ref, titleHint }: StartImportArgs): Promise<void> {
  const record = createVideo({ addedByUserId: userId, sourceType, sourceUrl: ref, title: titleHint ?? "" });
  const statusMessageId = await sendTelegramMessage(chatId, "⏳ Скачивание начато…");

  let lastEditAt = 0;
  let done = false;

  const unsubscribe = onDownloadProgress(record.id, (p) => {
    if (done) return;

    if (p.status === "ready") {
      done = true;
      unsubscribe();
      const title = p.title || titleHint || "видео";
      const button = watchVideoUrl(record.id);
      const doneText = `✅ Сохранено: <b>${escapeHtml(title)}</b>`;
      if (statusMessageId) {
        void editTelegramMessage(chatId, statusMessageId, doneText, button ? { text: "Смотреть вместе", url: button } : undefined);
      } else {
        void sendTelegramMessage(chatId, doneText, button ? { text: "Смотреть вместе", url: button } : undefined);
      }
      // The whole point of a downloader bot: hand over the actual file, not
      // just a link. Best-effort — a file over the current Bot API's limit
      // still leaves the video usable via the "watch together" button above.
      void deliverVideoFile(chatId, record.id, title);
      return;
    }

    if (p.status === "failed") {
      done = true;
      unsubscribe();
      const reason = p.errorMessage ? `: ${escapeHtml(p.errorMessage)}` : "";
      const failText = `⚠️ Не удалось скачать это видео${reason}`;
      if (statusMessageId) void editTelegramMessage(chatId, statusMessageId, failText);
      else void sendTelegramMessage(chatId, failText);
      return;
    }

    // downloading / converting — throttle edits (Telegram rate-limits edits
    // to a single message hard).
    if (!statusMessageId) return;
    const now = Date.now();
    if (now - lastEditAt < EDIT_THROTTLE_MS) return;
    lastEditAt = now;

    const label =
      p.status === "converting"
        ? `Обработка видео…\n${renderProgressBar(p.progressPercent)}`
        : `Скачивание… ${Math.round(p.progressPercent)}%${p.speedText ? ` · ${p.speedText}` : ""}\n${renderProgressBar(p.progressPercent)}`;
    void editTelegramMessage(chatId, statusMessageId, `⏳ ${label}`);
  });

  setTimeout(() => {
    if (!done) unsubscribe();
  }, PROGRESS_LISTEN_TIMEOUT_MS).unref?.();

  enqueueImport(record.id);
}

/** Sends the finished file itself to the chat. See sendTelegramVideoFile's
 *  doc comment for the 50 MB public-API limit this can hit. */
async function deliverVideoFile(chatId: number, videoId: string, title: string): Promise<void> {
  const record = getVideo(videoId);
  if (!record?.filePath) return;

  // Best-effort — a probe failure shouldn't block delivery, it just means
  // Telegram won't have a size hint for the pre-download placeholder.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const info = await probe(record.filePath, controller.signal).catch(() => null);
  clearTimeout(timer);
  const dimensions = info?.width && info.height ? { width: info.width, height: info.height, durationSeconds: info.durationSeconds } : undefined;

  const result = await sendTelegramVideoFile(chatId, record.filePath, escapeHtml(title), dimensions);
  if (!result.ok) {
    const note = result.tooLarge
      ? "⚠️ Файл слишком большой, чтобы прислать его прямо в чат (лимит Telegram Bot API) — но он сохранён, смотри по кнопке выше."
      : "⚠️ Не получилось прислать файл сюда — но он сохранён, смотри по кнопке выше.";
    void sendTelegramMessage(chatId, note);
  }
}
