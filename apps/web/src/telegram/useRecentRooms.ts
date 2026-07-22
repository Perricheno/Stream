import { useCallback, useEffect, useState } from "react";
import { readJson, writeJson } from "./cloudStorageJson";

const STORAGE_KEY = "stream:recent-rooms";
const MAX_RECENT = 5;

/** Persists recently visited room ids via Telegram CloudStorage (per-user), falling back to localStorage in dev. */
export function useRecentRooms() {
  const [rooms, setRooms] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readJson<string[]>(STORAGE_KEY, []).then((value) => {
      if (!cancelled) {
        setRooms(value);
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
      void writeJson(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { rooms, loaded, addRoom };
}
