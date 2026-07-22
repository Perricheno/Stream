import { useEffect } from "react";
import { mainButton, secondaryButton } from "@telegram-apps/sdk-react";

export interface UseMainButtonOptions {
  text: string;
  visible: boolean;
  enabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}

/** Drives Telegram's native MainButton as the room/home screen's primary CTA. */
export function useMainButton(options: UseMainButtonOptions): void {
  const { text, visible, enabled = true, loading = false, onClick } = options;

  useEffect(() => {
    if (mainButton.mount.isAvailable() && !mainButton.isMounted()) {
      mainButton.mount();
    }
    return () => {
      if (mainButton.isMounted()) mainButton.unmount();
    };
  }, []);

  useEffect(() => {
    if (!mainButton.setParams.isAvailable()) return;
    mainButton.setParams({
      text,
      isVisible: visible,
      isEnabled: enabled,
      isLoaderVisible: loading,
    });
  }, [text, visible, enabled, loading]);

  useEffect(() => {
    if (!mainButton.onClick.isAvailable()) return;
    return mainButton.onClick(onClick);
  }, [onClick]);
}

export interface UseSecondaryButtonOptions {
  text: string;
  visible: boolean;
  enabled?: boolean;
  onClick: () => void;
}

/** Drives Telegram's native SecondaryButton (e.g. "Share room link"). */
export function useSecondaryButton(options: UseSecondaryButtonOptions): void {
  const { text, visible, enabled = true, onClick } = options;

  useEffect(() => {
    if (secondaryButton.mount.isAvailable() && !secondaryButton.isMounted()) {
      secondaryButton.mount();
    }
    return () => {
      if (secondaryButton.isMounted()) secondaryButton.unmount();
    };
  }, []);

  useEffect(() => {
    if (!secondaryButton.setParams.isAvailable()) return;
    secondaryButton.setParams({
      text,
      isVisible: visible,
      isEnabled: enabled,
    });
  }, [text, visible, enabled]);

  useEffect(() => {
    if (!secondaryButton.onClick.isAvailable()) return;
    return secondaryButton.onClick(onClick);
  }, [onClick]);
}
