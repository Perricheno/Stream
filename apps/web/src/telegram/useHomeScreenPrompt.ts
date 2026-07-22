import { useCallback, useEffect, useState } from "react";
import { addToHomeScreen, checkHomeScreenStatus, onAddedToHomeScreen } from "@telegram-apps/sdk-react";

/**
 * Bot API 8.0's "pin the Mini App to the home screen" prompt. Only shown
 * when the platform supports it and the app isn't already pinned — Telegram
 * reports a "missed"/"added"/"unsupported"/"unknown" status via
 * `checkHomeScreenStatus`, not a plain boolean.
 */
export function useHomeScreenPrompt(): { canPrompt: boolean; prompt: () => void } {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!checkHomeScreenStatus.isAvailable()) return;
    checkHomeScreenStatus()
      .then((result) => setStatus(result))
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    if (!onAddedToHomeScreen.isAvailable()) return;
    return onAddedToHomeScreen(() => setStatus("added"));
  }, []);

  const prompt = useCallback(() => {
    if (addToHomeScreen.isAvailable()) addToHomeScreen();
  }, []);

  return { canPrompt: status === "missed", prompt };
}
