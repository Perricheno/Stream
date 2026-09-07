import { Placeholder, Spinner } from "@telegram-apps/telegram-ui";
import { AppProviders } from "./app/providers";
import { AppRouter } from "./app/router";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { TelegramLoginScreen } from "./auth/TelegramLoginScreen";
import { useProfile } from "./telegram/ProfileContext";
import { shouldUseTelegramAuth } from "./telegram/environment";

export function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <AuthGate />
      </AppProviders>
    </ErrorBoundary>
  );
}

/**
 * Inside Telegram (or local dev, which mocks a stand-in for it — see
 * telegram/environment.ts) identity always comes from initData, so the app
 * renders unconditionally. A plain browser visit has no initData; ProfileContext's
 * GET /api/profile (see ProfileContext.tsx) is what reveals whether a Telegram
 * Login session cookie already covers it (profile loads) or not (401 — show
 * the login screen instead of an app with nothing to authenticate its calls).
 */
function AuthGate() {
  const { profile, loaded } = useProfile();

  if (shouldUseTelegramAuth() || profile) return <AppRouter />;

  if (!loaded) {
    return (
      <Placeholder>
        <Spinner size="l" />
      </Placeholder>
    );
  }

  return <TelegramLoginScreen />;
}
