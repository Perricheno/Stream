import { useCallback } from "react";
import { useProfile } from "../telegram/ProfileContext";
import { translations, type TranslationKey } from "./translations";

/** Reads the user's language preference (server profile) and returns a `t()` lookup. Defaults to Russian while the profile is still loading. */
export function useTranslation() {
  const { profile } = useProfile();
  const language = profile?.language ?? "ru";
  const dict = translations[language];

  const t = useCallback((key: TranslationKey) => dict[key], [dict]);

  return { t, language };
}
