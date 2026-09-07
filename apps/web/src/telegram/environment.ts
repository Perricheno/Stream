import { isTMA } from "@telegram-apps/sdk-react";

/**
 * True only for an actual local dev machine (`pnpm dev` opened at
 * localhost). `import.meta.env.DEV` alone isn't enough — this project's dev
 * server is routinely tunneled out to a public domain for real visitors (see
 * README), and it's still a Vite dev build in that setup, so DEV stays true
 * for them too. Checking the hostname is what actually tells apart "someone
 * testing locally" from "a real visitor hitting the public tunnel."
 */
function isLocalDevHost(): boolean {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/** True only on an actual local dev machine — see isLocalDevHost's doc comment for why `import.meta.env.DEV` alone can't tell. */
export function isLocalDevEnvironment(): boolean {
  return import.meta.env.DEV && isLocalDevHost();
}

/**
 * True inside a real Telegram client, or in local dev (where `init.ts`'s
 * mocked Telegram environment stands in for one so `pnpm dev` in a plain
 * browser keeps working exactly as before). Both cases keep using the
 * existing initData-based auth path (socket/apiClient) — a real visitor on
 * the public tunnel with neither needs the website's Telegram Login screen
 * instead (see auth/TelegramLoginScreen.tsx).
 */
export function shouldUseTelegramAuth(): boolean {
  return isTMA("simple") || isLocalDevEnvironment();
}

/**
 * True only inside an actual Telegram client — unlike shouldUseTelegramAuth(),
 * NOT true in local dev. For behavior that models a real Telegram WebView
 * quirk (the OS suspending backgrounded video — see
 * player/useSyncedPlayback.ts), not "which auth path to use": a plain
 * desktop browser running `pnpm dev` doesn't get its video OS-suspended
 * either, so it must NOT take the same branch as real Telegram here.
 */
export function isRealTelegramClient(): boolean {
  return isTMA("simple");
}
