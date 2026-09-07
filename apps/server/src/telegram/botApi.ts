import { env } from "../config/env";

const DEFAULT_TIMEOUT_MS = 10_000;

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
    const data = (await res.json()) as TelegramApiResponse<T>;
    if (!data.ok) {
      throw new TelegramApiError(data.description ?? `Telegram API error calling ${method}`, data.error_code, data.parameters?.retry_after);
    }
    return data.result as T;
  } finally {
    clearTimeout(timer);
  }
}
