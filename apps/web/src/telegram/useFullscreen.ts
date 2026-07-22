import { useCallback } from "react";
import { exitFullscreen, isFullscreen, requestFullscreen, useSignal } from "@telegram-apps/sdk-react";

/**
 * Wraps Telegram's Bot API 8.0 app-level fullscreen (distinct from the
 * video's own CSS-only fullscreen) — hides Telegram's own header chrome so
 * the whole Mini App fills the screen. Unsupported on older clients/desktop,
 * so callers should hide the toggle entirely when `isSupported` is false.
 */
export function useFullscreen(): { isFullscreen: boolean; isSupported: boolean; toggle: () => void } {
  const active = useSignal(isFullscreen);
  const isSupported = requestFullscreen.isAvailable() && exitFullscreen.isAvailable();

  const toggle = useCallback(() => {
    if (!isSupported) return;
    if (active) {
      exitFullscreen();
    } else {
      requestFullscreen().catch(() => {
        // Some clients report support but still reject (e.g. mid-transition) — no-op.
      });
    }
  }, [active, isSupported]);

  return { isFullscreen: active, isSupported, toggle };
}
