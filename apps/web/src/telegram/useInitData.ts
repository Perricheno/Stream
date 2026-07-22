import { initData, useSignal } from "@telegram-apps/sdk-react";

/** The raw initData string sent to the backend to authenticate the socket connection. */
export function useInitDataRaw(): string | undefined {
  return useSignal(initData.raw);
}

/** The current Telegram user, once initData has been parsed. */
export function useTelegramUser() {
  return useSignal(initData.user);
}
