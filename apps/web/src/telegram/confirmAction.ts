import { isTMA, popup } from "@telegram-apps/sdk-react";

/**
 * Confirms a destructive action. Uses Telegram's native popup inside a real
 * client; falls back to `window.confirm` in plain-browser dev, since the
 * mocked environment never answers `web_app_open_popup` and the promise
 * would otherwise hang forever.
 */
export async function confirmAction(message: string, title?: string): Promise<boolean> {
  if (isTMA("simple") && popup.open.isAvailable()) {
    const buttonId = await popup.open({
      title,
      message,
      buttons: [
        { id: "confirm", type: "destructive", text: "Покинуть" },
        { id: "cancel", type: "cancel" },
      ],
    });
    return buttonId === "confirm";
  }
  return window.confirm(message);
}
