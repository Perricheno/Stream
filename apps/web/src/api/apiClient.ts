import { initData } from "@telegram-apps/sdk-react";
import { getRawInitData } from "../telegram/rawInitData";
import { shouldUseTelegramAuth } from "../telegram/environment";

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // Outside Telegram (and outside local dev's mocked stand-in for it), there
  // is no real initData to send — the session cookie from Telegram Login
  // (see auth/TelegramLoginScreen.tsx) carries identity instead, via
  // `credentials: "include"` below. Sending the dev/mock's fabricated
  // initData in that case would make the server's initData check fail
  // outright instead of falling through to that cookie (see
  // requireTelegramAuth.ts).
  const raw = shouldUseTelegramAuth() ? initData.raw() || getRawInitData() || "" : "";
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Init-Data": raw,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new ApiError(res.status, body.error ?? `Request failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
};

export { ApiError };
