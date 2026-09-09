import { openAsBlob } from "node:fs";
import { basename } from "node:path";
import { env } from "../config/env";

const DEFAULT_TIMEOUT_MS = 10_000;
/** Uploading a video can take minutes over a slow connection — a generous,
 *  separate timeout so it isn't cut off at the default 10s. */
const UPLOAD_TIMEOUT_MS = 10 * 60_000;

export class TelegramApiError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

function unwrap<T>(data: TelegramApiResponse<T>, method: string): T {
  if (!data.ok) {
    throw new TelegramApiError(data.description ?? `Telegram API error calling ${method}`, data.error_code, data.parameters?.retry_after);
  }
  return data.result as T;
}

/**
 * Thin wrapper around a single Bot API call. `timeoutMs` defaults to 10s but
 * needs to be raised for long-polling `getUpdates` calls, whose `timeout`
 * param tells Telegram to hold the connection open for that many seconds.
 */
export async function callBotApi<T>(method: string, params?: Record<string, unknown>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${env.botApiBaseUrl}/bot${env.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params ?? {}),
      signal: controller.signal,
    });
    return unwrap(await res.json(), method);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A Bot API call that uploads a local file as multipart/form-data (e.g.
 * sendVideo). Reads the file as a `Blob` via `fs.openAsBlob` — backed by the
 * file handle, not loaded into memory — so a multi-GB video doesn't get
 * buffered whole before the request even starts.
 *
 * The public Bot API caps this kind of upload at 50 MB regardless of what
 * TELEGRAM_BOT_API_BASE_URL points at; only a self-hosted Local Bot API
 * Server (see deploy/) raises that to 2000 MB. A file over the limit fails
 * with a TelegramApiError — callers decide how to tell the user.
 */
export async function callBotApiMultipart<T>(
  method: string,
  params: Record<string, string>,
  file: { field: string; path: string; filename?: string },
  timeoutMs = UPLOAD_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const form = new FormData();
    for (const [key, value] of Object.entries(params)) form.append(key, value);
    form.append(file.field, await openAsBlob(file.path), file.filename ?? basename(file.path));

    const res = await fetch(`${env.botApiBaseUrl}/bot${env.botToken}/${method}`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    return unwrap(await res.json(), method);
  } finally {
    clearTimeout(timer);
  }
}
