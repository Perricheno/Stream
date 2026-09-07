/**
 * Client-side playback-sync tracing. Off by default (it's noisy — several
 * lines per second). Turn on in the browser console with:
 *
 *   localStorage.setItem("stream:sync-debug", "1"); location.reload();
 *
 * Lines are prefixed `[sync]` and carry a `t` (Date.now()) so they line up
 * against the server's `[room] ... {t}` log for the same session.
 */
let enabled = false;
try {
  enabled = localStorage.getItem("stream:sync-debug") === "1";
} catch {
  // storage blocked (private window, etc.) — stay off
}

export const syncDebugEnabled = enabled;

export function syncLog(event: string, data?: Record<string, unknown>): void {
  if (!enabled) return;
  // eslint-disable-next-line no-console
  console.log(`%c[sync] ${event}`, "color:#2ea6ff;font-weight:600", { t: Date.now(), ...data });
}
