/** Registers the ad/tracker-blocking service worker (public/sw.js). Scoped to
 *  "/" so it sees every fetch this app makes — see that file for exactly
 *  what it can and can't block. Best-effort: unsupported browsers (or a
 *  failed registration) just mean no blocking, never a broken app. */
export function registerAdblock(): void {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
