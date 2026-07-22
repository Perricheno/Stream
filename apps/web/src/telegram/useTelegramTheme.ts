import { themeParams, useSignal } from "@telegram-apps/sdk-react";

/** Live-updating flag for whether the current Telegram theme is dark, driving `AppRoot`'s `appearance`. */
export function useTelegramAppearance(): "light" | "dark" {
  const isDark = useSignal(themeParams.isDark);
  return isDark ? "dark" : "light";
}
