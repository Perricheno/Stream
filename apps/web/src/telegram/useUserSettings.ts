import { useCallback, useEffect, useState } from "react";
import { readJson, writeJson } from "./cloudStorageJson";

const STORAGE_KEY = "stream:settings";

export interface UserSettings {
  /** Room-scoped display name override; empty means "use my Telegram name". */
  displayName: string;
  /** If true, other participants see this user as "Аноним" with no photo. */
  hideProfile: boolean;
}

const DEFAULT_SETTINGS: UserSettings = { displayName: "", hideProfile: false };

/** Persists the user's room profile preferences (name override, visibility) across all rooms. */
export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readJson<UserSettings>(STORAGE_KEY, DEFAULT_SETTINGS).then((value) => {
      if (!cancelled) {
        setSettings(value);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void writeJson(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { settings, loaded, updateSettings };
}
