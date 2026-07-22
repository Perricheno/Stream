import {
  backButton,
  init as initSdk,
  isTMA,
  miniApp,
  mockTelegramEnv,
  themeParams,
  viewport,
} from "@telegram-apps/sdk-react";

const DEV_USER = {
  id: 1,
  first_name: "Dev",
  last_name: "User",
  username: "dev_user",
  language_code: "en",
};

function buildMockLaunchParams() {
  const authDateSeconds = Math.floor(Date.now() / 1000);
  const hash = "0".repeat(64);
  const initDataRaw = new URLSearchParams({
    user: JSON.stringify(DEV_USER),
    auth_date: String(authDateSeconds),
    hash,
  }).toString();

  return {
    themeParams: {
      accentTextColor: "#6ab2f2",
      bgColor: "#17212b",
      buttonColor: "#5288c1",
      buttonTextColor: "#ffffff",
      destructiveTextColor: "#ec3942",
      headerBgColor: "#17212b",
      hintColor: "#708499",
      linkColor: "#6ab3f3",
      secondaryBgColor: "#232e3c",
      sectionBgColor: "#17212b",
      sectionHeaderTextColor: "#6ab3f3",
      subtitleTextColor: "#708499",
      textColor: "#f5f5f5",
    } as const,
    initData: {
      authDate: new Date(authDateSeconds * 1000),
      hash,
      signature: "dev-mock-signature",
      user: {
        id: DEV_USER.id,
        firstName: DEV_USER.first_name,
        lastName: DEV_USER.last_name,
        username: DEV_USER.username,
        languageCode: DEV_USER.language_code,
      },
    },
    initDataRaw,
    version: "8",
    platform: "tdesktop" as const,
  };
}

/**
 * Boots the Telegram SDK. Outside a real Telegram client (plain browser dev)
 * this fabricates a launch context first, so every hook below has something
 * to read — see README for how initData validation is bypassed server-side
 * in that case.
 *
 * Some real Telegram clients omit fields the SDK's launch-params parser
 * treats as required (e.g. `signature`), which makes `init()` throw even
 * though we're genuinely inside Telegram. If that happens we fall back to
 * the mock environment so the UI (theme, buttons, haptics) still works —
 * the socket auth path doesn't depend on this parser anyway, it reads the
 * raw initData straight from the URL (see rawInitData.ts).
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

  if (!initialized) {
    mockTelegramEnv(buildMockLaunchParams());
    initSdk();
  }

  if (miniApp.mount.isAvailable()) miniApp.mount();
  if (miniApp.bindCssVars.isAvailable()) miniApp.bindCssVars();
  if (themeParams.bindCssVars.isAvailable()) themeParams.bindCssVars();
  if (backButton.mount.isAvailable()) backButton.mount();

  if (viewport.mount.isAvailable() && !viewport.isMounting()) {
    viewport
      .mount()
      .then(() => {
        if (viewport.expand.isAvailable()) viewport.expand();
        if (viewport.bindCssVars.isAvailable()) viewport.bindCssVars();
      })
      .catch(() => {
        // Viewport isn't available in this environment (e.g. some desktop
        // clients) — the app still works without expand/safe-area CSS vars.
      });
  }

  if (miniApp.ready.isAvailable()) miniApp.ready();
}
