import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser login via the bot, not Telegram's Login Widget.
 *
 * The widget (and the OIDC flow behind it) only work from an origin that's
 * been pre-registered with @BotFather, and until it is they fail with a bare
 * "origin required" and no way to tell what's wrong. This path avoids the
 * whole thing: ask the server for a one-time token, send the visitor to
 * `t.me/<bot>?start=<token>`, and poll until the bot reports back that they
 * pressed Start. The bot already knows who they are — that's the trust
 * anchor, and it needs no domain registration at all.
 */

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export type TelegramLoginState = "idle" | "pending" | "error" | "expired";

interface LinkResponse {
  token: string;
  deepLink: string;
}

export function useTelegramLoginWidget() {
  const [state, setState] = useState<TelegramLoginState>("idle");
  /** Shown as a fallback when the popup was blocked, so there's always a way through. */
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const stopRef = useRef(false);

  useEffect(
    () => () => {
      stopRef.current = true;
    },
    [],
  );

  const login = useCallback(() => {
    setState("pending");
    setDeepLink(null);
    stopRef.current = false;

    // Opened synchronously with the click: browsers only allow window.open
    // from a real user gesture, and awaiting the fetch first would lose it.
    const popup = window.open("", "_blank");

    void (async () => {
      try {
        const linkRes = await fetch("/api/auth/link", { method: "POST", credentials: "include" });
        if (!linkRes.ok) throw new Error("link failed");
        const { token, deepLink: link } = (await linkRes.json()) as LinkResponse;

        setDeepLink(link);
        if (popup && !popup.closed) popup.location.href = link;

        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (!stopRef.current && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          if (stopRef.current) return;

          const pollRes = await fetch(`/api/auth/poll?token=${encodeURIComponent(token)}`, {
            credentials: "include",
          });
          if (!pollRes.ok) continue;
          const { status } = (await pollRes.json()) as { status: "pending" | "completed" | "expired" };

          if (status === "completed") {
            popup?.close();
            // Simplest correct way to re-run every provider (ProfileProvider
            // especially) against the now-real session cookie.
            window.location.reload();
            return;
          }
          if (status === "expired") {
            setState("expired");
            return;
          }
        }
        if (!stopRef.current) setState("expired");
      } catch {
        popup?.close();
        if (!stopRef.current) setState("error");
      }
    })();
  }, []);

  return { state, login, deepLink, configured: true };
}
