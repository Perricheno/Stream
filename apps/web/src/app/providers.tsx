import { useEffect, type ReactNode } from "react";
import { AppRoot } from "@telegram-apps/telegram-ui";
import { useLaunchParams } from "@telegram-apps/sdk-react";
import { useTelegramAppearance } from "../telegram/useTelegramTheme";
import { ProfileProvider } from "../telegram/ProfileContext";

export function AppProviders({ children }: { children: ReactNode }) {
  const appearance = useTelegramAppearance();
  const { platform } = useLaunchParams();

  // Drives the fixed brand palette in global.css (Stream's own colors,
  // deliberately NOT the live --tg-theme-* values Telegram binds from each
  // user's personal accent-color choice) — see the comment there for why.
  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
  }, [appearance]);

  return (
    <AppRoot appearance={appearance} platform={platform === "ios" ? "ios" : "base"}>
      <ProfileProvider>{children}</ProfileProvider>
    </AppRoot>
  );
}
