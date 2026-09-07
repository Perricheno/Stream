import {
  backButton,
  closingBehavior,
  init as initSdk,
  isTMA,
  miniApp,
  requestFullscreen,
  swipeBehavior,
  themeParams,
  viewport,
} from "@telegram-apps/sdk-react";
import { isLocalDevEnvironment } from "./environment";

const DEV_USER = {
  id: 1,
  first_name: "Dev",
  last_name: "User",
  username: "dev_user",
  language_code: "en",
};

/**
 * Best-effort platform guess for the mock fallback below. Matters even on a
 * real device: telegram-ui renders visibly different (and correct-looking)
 * styles for "ios" vs "base", so if we ever fall back to the mock on a real
 * iPhone, hardcoding "tdesktop" would make every Cell/Section look wrong.
 */
function detectMockPlatform(): "ios" | "android" | "tdesktop" {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "tdesktop";
}

/**
 * Puts the launch params in the URL hash — the same place a real Telegram
 * launch puts them, and the first (most reliable) source
 * `retrieveLaunchParams()` checks. Both `mockTelegramEnv()`'s own
 * object→string serializer AND its sessionStorage-fallback path have a bug
 * in this SDK version that silently drops `platform`/`initData` on the
 * round-trip, making `init()` throw even immediately after mocking — the
 * URL-hash path avoids both, since it's parsed directly with no round-trip.
 * Also installs a minimal `TelegramWebviewProxy.postEvent` stub so native
 * calls (haptics, buttons, popups) no-op instead of throwing in this
 * dev-only path.
 */
function installMockBridge(rawLaunchParams: string): void {
  window.location.hash = rawLaunchParams;
  (window as unknown as { TelegramWebviewProxy: { postEvent: (event: string, data?: unknown) => void } }).TelegramWebviewProxy = {
    postEvent: () => {
      // Mock/dev only — this path never runs inside real Telegram.
    },
  };
}

function buildMockLaunchParamsRaw(): string {
  const authDateSeconds = Math.floor(Date.now() / 1000);
  const hash = "0".repeat(64);
  const initDataRaw = new URLSearchParams({
    user: JSON.stringify(DEV_USER),
    auth_date: String(authDateSeconds),
    hash,
    // The typed InitData shape requires `signature` — any string satisfies
    // the parser here, it's only actually verified server-side via `hash`.
    signature: "dev-mock-signature",
  }).toString();

  const themeParamsRaw = JSON.stringify({
    accent_text_color: "#6ab2f2",
    bg_color: "#17212b",
    button_color: "#5288c1",
    button_text_color: "#ffffff",
    destructive_text_color: "#ec3942",
    header_bg_color: "#17212b",
    hint_color: "#708499",
    link_color: "#6ab3f3",
    secondary_bg_color: "#232e3c",
    section_bg_color: "#17212b",
    section_header_text_color: "#6ab3f3",
    subtitle_text_color: "#708499",
    text_color: "#f5f5f5",
  });

  return new URLSearchParams({
    tgWebAppData: initDataRaw,
    tgWebAppVersion: "8",
    tgWebAppPlatform: detectMockPlatform(),
    tgWebAppThemeParams: themeParamsRaw,
  }).toString();
}

/**
 * Boots the Telegram SDK. On an actual local dev machine (not a real
 * Telegram client) this fabricates a launch context first, so every hook
 * below has something to read — see README for how initData validation is
 * bypassed server-side in that case.
 *
 * Some real Telegram clients omit fields the SDK's launch-params parser
 * treats as required (e.g. `signature`), which makes `init()` throw even
 * though we're genuinely inside Telegram. If that happens too — and we're on
 * a local dev machine — we fall back to the mock environment so the UI
 * (theme, buttons, haptics) still works; the socket auth path doesn't depend
 * on this parser anyway, it reads the raw initData straight from the URL
 * (see rawInitData.ts), which is already captured before this ever runs.
 *
 * A real visitor on the public tunnel who hits either case just renders
 * without the mock (isLocalDevEnvironment() is false there) — mounting a
 * fake Telegram identity for them would make shouldUseTelegramAuth() think
 * they're in Telegram and skip straight to a room connection with fabricated
 * credentials the server rejects, instead of showing the website's own
 * Telegram Login screen (see environment.ts).
 *
 * Both branches are wrapped defensively: an uncaught throw here happens
 * before React ever mounts (this runs at the top of main.tsx), so it would
 * blank the entire page rather than degrade gracefully.
 */
export function bootstrapTelegram(): void {
  let initialized = false;

  if (isTMA("simple")) {
    try {
      initSdk();
      initialized = true;
    } catch (err) {
      console.warn(
        "[telegram] Failed to initialize against the real environment, falling back to mock:",
        err,
      );
    }
  }

  if (!initialized && isLocalDevEnvironment()) {
    try {
      installMockBridge(buildMockLaunchParamsRaw());
      initSdk();
      initialized = true;
    } catch (err) {
      console.error(
        "[telegram] Mock environment initialization also failed — the app will render without Telegram theming/buttons:",
        err,
      );
    }
  }

  if (!initialized) return;

  if (miniApp.mount.isAvailable()) miniApp.mount();
  if (miniApp.bindCssVars.isAvailable()) miniApp.bindCssVars();
  if (themeParams.bindCssVars.isAvailable()) themeParams.bindCssVars();
  if (backButton.mount.isAvailable()) backButton.mount();
  if (closingBehavior.mount.isAvailable()) closingBehavior.mount();
  // Mounted globally, toggled per-screen (see useDisableVerticalSwipes) — the
  // Room screen's video overlay has its own vertical swipe-for-volume
  // gesture, which Telegram's native swipe-to-minimize would otherwise fight
  // over the same gesture. CSS touch-action can't reach that native gesture
  // recognizer (it lives in the host app, above the WebView's own DOM/CSS),
  // so this SDK call is the only way to actually suppress it.
  if (swipeBehavior.mount.isAvailable()) swipeBehavior.mount();

  if (viewport.mount.isAvailable() && !viewport.isMounting()) {
    viewport
      .mount()
      .then(() => {
        if (viewport.expand.isAvailable()) viewport.expand();
        if (viewport.bindCssVars.isAvailable()) viewport.bindCssVars();
        // Requests real app-level fullscreen (Bot API 8.0) right away rather
        // than leaving it behind a menu toggle. Without this, iOS shows the
        // Mini App as a draggable bottom sheet — a user can drag it up/down
        // mid-use, which briefly exposes blank space while the WebView's
        // viewport height is still catching up to the new sheet position.
        // Locking into fullscreen removes the drag gesture entirely.
        if (requestFullscreen.isAvailable()) {
          requestFullscreen().catch(() => {
            // Older clients/desktop report support inconsistently — the app
            // still works fine in the regular expanded (non-fullscreen) state.
          });
        }
      })
      .catch(() => {
        // Viewport isn't available in this environment (e.g. some desktop
        // clients) — the app still works without expand/safe-area CSS vars.
      });
  }

  if (miniApp.ready.isAvailable()) miniApp.ready();
}
