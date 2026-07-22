import type { ReactNode } from "react";
import { AppRoot } from "@telegram-apps/telegram-ui";
import { useLaunchParams } from "@telegram-apps/sdk-react";
import { useTelegramAppearance } from "../telegram/useTelegramTheme";

export function AppProviders({ children }: { children: ReactNode }) {
  const appearance = useTelegramAppearance();
  const { platform } = useLaunchParams();

  return (
    <AppRoot appearance={appearance} platform={platform === "ios" ? "ios" : "base"}>
      {children}
    </AppRoot>
  );
}
