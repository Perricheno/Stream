import { cloudStorage } from "@telegram-apps/sdk-react";

async function readRaw(key: string): Promise<string> {
  if (cloudStorage.getItem.isAvailable()) {
    try {
      return (await cloudStorage.getItem(key)) || "";
    } catch {
      // Fall through to localStorage below.
    }
  }
  return localStorage.getItem(key) ?? "";
}

async function writeRaw(key: string, value: string): Promise<void> {
  if (cloudStorage.setItem.isAvailable()) {
    try {
      await cloudStorage.setItem(key, value);
      return;
    } catch {
      // Fall through to localStorage below.
    }
  }
  localStorage.setItem(key, value);
}

/** Reads a JSON value via Telegram CloudStorage (per-user), falling back to localStorage in dev. */
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await readRaw(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson<T>(key: string, value: T): Promise<void> {
  await writeRaw(key, JSON.stringify(value));
}
