import { useEffect } from "react";
import { backButton } from "@telegram-apps/sdk-react";

/** Shows Telegram's native BackButton while `visible` is true and wires its click to `onClick`. */
export function useBackButton(visible: boolean, onClick: () => void): void {
  useEffect(() => {
    if (!visible) return;
    if (backButton.show.isAvailable()) backButton.show();
    const off = backButton.onClick.isAvailable() ? backButton.onClick(onClick) : undefined;
    return () => {
      off?.();
      if (backButton.hide.isAvailable()) backButton.hide();
    };
  }, [visible, onClick]);
}
