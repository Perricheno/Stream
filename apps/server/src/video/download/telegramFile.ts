import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { env } from "../../config/env";
import { callBotApi } from "../../telegram/botApi";

export interface TelegramFileDownloadOptions {
  fileId: string;
  outputPath: string;
  onProgress: (percent: number, receivedBytes: number) => void;
  signal: AbortSignal;
}

/**
 * Downloads a file a user sent straight to the bot. Telegram's public Bot API
 * caps getFile downloads at 20 MB — for full-quality video the deployment
 * must front this with a self-hosted Local Bot API Server (see
 * TELEGRAM_BOT_API_BASE_URL), which raises that to 2000 MB. The HTTP file
 * path (`/file/bot<token>/<path>`) is the same shape either way.
 */
export async function downloadTelegramFile(opts: TelegramFileDownloadOptions): Promise<{ filePath: string }> {
  const file = await callBotApi<{ file_path?: string; file_size?: number }>("getFile", { file_id: opts.fileId });
  if (!file.file_path) throw new Error("Telegram wouldn't hand over that file (it may be too large for this bot)");

  const res = await fetch(`${env.botApiBaseUrl}/file/bot${env.botToken}/${file.file_path}`, { signal: opts.signal });
  if (!res.ok || !res.body) {
    throw new Error(res.status === 404 ? "the file expired on Telegram's side" : `couldn't fetch the file (${res.status})`);
  }

  const total = Number(res.headers.get("content-length")) || file.file_size || 0;
  let received = 0;
  const meter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      opts.onProgress(total ? Math.min(99, (received / total) * 100) : 0, received);
      controller.enqueue(chunk);
    },
  });

  try {
    const piped = res.body.pipeThrough(meter) as unknown as import("node:stream/web").ReadableStream<Uint8Array>;
    await pipeline(Readable.fromWeb(piped), createWriteStream(opts.outputPath), { signal: opts.signal });
  } catch (err) {
    await unlink(opts.outputPath).catch(() => undefined);
    throw err;
  }
  return { filePath: opts.outputPath };
}
