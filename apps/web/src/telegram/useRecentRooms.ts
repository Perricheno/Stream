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
    const load = () => {
      readJson<string[]>(STORAGE_KEY, []).then((value) => {
        if (!cancelled) {
          setRooms(value);
          setLoaded(true);
        }
      });
    };
    load();

    // CloudStorage is per-account, not per-device — a room created on one
    // of the user's other devices only shows up here once we actually
    // re-read it. Re-reading only on mount meant coming back to an
    // already-open Home screen (switching apps and back) kept showing
    // whatever was cached from whenever this component first mounted.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
