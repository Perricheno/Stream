import { initData } from "@telegram-apps/sdk-react";
import { getRawInitData } from "../telegram/rawInitData";

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const raw = initData.raw() || getRawInitData() || "";
  const res = await fetch(`/api${path}`, {
    ...options,
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
