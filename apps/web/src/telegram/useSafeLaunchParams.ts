import { useMemo } from "react";
import { retrieveLaunchParams } from "@telegram-apps/sdk-react";

export interface SafeLaunchParams {
  /** "ios" | "android" | "tdesktop" | … — undefined outside Telegram. */
  platform?: string;
  /** `?startapp=` payload (room_/video_/addfriend_ deep links). */
  startParam?: string;
}

/**
 * Launch params, or an empty object outside Telegram.
 *
 * The SDK's own `useLaunchParams()` *throws* when there's nothing to read —
 * and it was being called from AppProviders, which wraps the entire app, so
 * for anyone opening the site in a plain browser that throw tore down the
 * whole React tree and left a blank white page. They never even got as far
 * as the Telegram Login screen that's supposed to greet them.
 *
 * Reads via `retrieveLaunchParams()` inside our own memo rather than
 * wrapping the SDK hook, so this doesn't depend on that hook's internals.
 */
export function useSafeLaunchParams(): SafeLaunchParams {
  return useMemo(() => {
    try {
      const lp = retrieveLaunchParams() as unknown as Record<string, unknown>;
      return {
        platform: (lp.tgWebAppPlatform ?? lp.platform) as string | undefined,
        startParam: (lp.tgWebAppStartParam ?? lp.startParam) as string | undefined,
      };
    } catch {
      return {};
    }
  }, []);
}
