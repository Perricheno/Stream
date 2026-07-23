import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { UserProfile } from "@stream/shared";
import { api } from "../api/apiClient";

interface ProfileContextValue {
  profile: UserProfile | null;
  loaded: boolean;
  updateProfile: (patch: Partial<UserProfile>) => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * Fetches the server-backed profile exactly once for the whole app (not
 * per-component) — several screens/hooks (Settings, translations, autoplay)
 * all need it, and without a shared provider each would fire its own
 * GET /api/profile request.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<UserProfile>("/profile")
      .then((data) => {
        if (!cancelled) {
          setProfile(data);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateProfile = useCallback((patch: Partial<UserProfile>) => {
    let previous: UserProfile | null = null;
    setProfile((prev) => {
      previous = prev;
      return prev ? { ...prev, ...patch } : prev;
    });
    api
      .patch<UserProfile>("/profile", patch)
      .then(setProfile)
      .catch(() => {
        // The optimistic update above never actually saved — roll it back
        // instead of leaving the UI showing a setting that isn't real.
        setProfile(previous);
      });
  }, []);

  return <ProfileContext.Provider value={{ profile, loaded, updateProfile }}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within a ProfileProvider");
  return ctx;
}
