import { useCallback, useEffect, useState } from "react";

const BOT_ID = import.meta.env.VITE_TELEGRAM_BOT_ID as string | undefined;
const WIDGET_SCRIPT_SRC = "https://oauth.telegram.org/js/telegram-login.js?22";

interface TelegramLoginAuthData {
  id_token?: string;
  error?: string;
}

declare global {
  interface Window {
    Telegram?: {
      Login: {
        auth(
          // The Telegram Login library documents client_id / scope / lang /
          // nonce. `request_access` is from the older widget API — the
          // library reads it only as a fallback and it isn't needed here.
          options: { client_id: string; scope?: string[]; lang?: string; nonce?: string },
          callback: (data: TelegramLoginAuthData | false) => void,
        ): void;
      };
    };
  }
}

/** Loads the widget script at most once, reusing an already-loading/loaded
 *  copy — the login screen can be reached again (e.g. after a failed
 *  attempt) without re-injecting a duplicate <script> tag each time. */
function loadWidgetScript(): Promise<void> {
  if (window.Telegram?.Login) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${WIDGET_SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("failed to load Telegram Login widget")));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = WIDGET_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("failed to load Telegram Login widget"));
    document.head.appendChild(script);
  });
}

export type TelegramLoginState = "idle" | "pending" | "error";

/**
 * Drives Telegram's hosted login popup (the OIDC flow in oath.txt) via its JS
 * API rather than the injected iframe widget, so callers can render their own
 * button instead of Telegram's default-styled one. Shared by every screen
 * that needs a "Log in with Telegram" action (see TelegramLoginScreen.tsx).
 */
export function useTelegramLoginWidget() {
  const [state, setState] = useState<TelegramLoginState>("idle");

  useEffect(() => {
    if (BOT_ID) void loadWidgetScript().catch(() => setState("error"));
  }, []);

  const login = useCallback(() => {
    if (!BOT_ID) {
      setState("error");
      return;
    }
    setState("pending");
    loadWidgetScript()
      .then(
        () =>
          new Promise<string>((resolve, reject) => {
            window.Telegram!.Login.auth({ client_id: BOT_ID, scope: ["profile"] }, (data) => {
              if (!data || !data.id_token) {
                reject(new Error("login cancelled or failed"));
                return;
              }
              resolve(data.id_token);
            });
          }),
      )
      .then((idToken) =>
        fetch("/api/auth/telegram-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ idToken }),
        }),
      )
      .then((res) => {
        if (!res.ok) throw new Error("server rejected login");
        // Simplest correct way to re-run every provider (ProfileProvider
        // especially) against the now-real session cookie, instead of
        // threading a "just logged in" state through the whole app.
        window.location.reload();
      })
      .catch(() => setState("error"));
  }, []);

  return { state, login, configured: Boolean(BOT_ID) };
}
