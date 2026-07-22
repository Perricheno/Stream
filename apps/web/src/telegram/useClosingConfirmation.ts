import { useEffect } from "react";
import { closingBehavior } from "@telegram-apps/sdk-react";

/**
 * Shows Telegram's native "close the app?" confirmation while `enabled` —
 * covers closing via Telegram's own X/swipe-down gesture, which bypasses our
 * custom back-button confirmation (see useBackButton.ts) entirely since that
 * only intercepts in-app navigation, not the platform's own close action.
 */
export function useClosingConfirmation(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    if (closingBehavior.enableConfirmation.isAvailable()) closingBehavior.enableConfirmation();
    return () => {
      if (closingBehavior.disableConfirmation.isAvailable()) closingBehavior.disableConfirmation();
    };
  }, [enabled]);
}
