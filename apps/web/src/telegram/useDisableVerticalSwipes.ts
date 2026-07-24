import { useEffect } from "react";
import { swipeBehavior } from "@telegram-apps/sdk-react";

/**
 * Suppresses Telegram's native swipe-down-to-minimize gesture while
 * `disabled` is true, restoring it on cleanup. The Room screen's video
 * controls use their own vertical swipe for volume (see
 * VideoControlsOverlay.tsx) — without this, dragging up/down on the video
 * can simultaneously trigger Telegram's own minimize gesture, since that
 * gesture recognizer lives in the host app above the WebView and isn't
 * reachable by CSS `touch-action`.
 */
export function useDisableVerticalSwipes(disabled: boolean): void {
  useEffect(() => {
    if (!disabled) return;
    if (swipeBehavior.disableVertical.isAvailable()) swipeBehavior.disableVertical();
    return () => {
      if (swipeBehavior.enableVertical.isAvailable()) swipeBehavior.enableVertical();
    };
  }, [disabled]);
}
