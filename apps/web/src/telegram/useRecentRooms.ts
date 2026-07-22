import { useCallback, useEffect, useState } from "react";
import { cloudStorage } from "@telegram-apps/sdk-react";

const STORAGE_KEY = "stream:recent-rooms";
const MAX_RECENT = 5;

async function readRaw(): Promise<string> {
  if (cloudStorage.getItem.isAvailable()) {
    try {
      return (await cloudStorage.getItem(STORAGE_KEY)) || "";
    } catch {
      // Fall through to localStorage below.
    }
  }
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

async function writeRaw(value: string): Promise<void> {
  if (cloudStorage.setItem.isAvailable()) {
    try {
      await cloudStorage.setItem(STORAGE_KEY, value);
      return;
    } catch {
      // Fall through to localStorage below.
    }
  }
  localStorage.setItem(STORAGE_KEY, value);
}

function parseRooms(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Persists recently visited room ids via Telegram CloudStorage (per-user), falling back to localStorage in dev. */
export function useRecentRooms() {
  const [rooms, setRooms] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readRaw().then((raw) => {
      if (!cancelled) {
        setRooms(parseRooms(raw));
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const addRoom = useCallback((roomId: string) => {
    setRooms((prev) => {
      const next = [roomId, ...prev.filter((id) => id !== roomId)].slice(0, MAX_RECENT);
      void writeRaw(JSON.stringify(next));
      return next;
    });
  }, []);

  return { rooms, loaded, addRoom };
}
