const STORAGE_KEY = "stream:raw-init-data";

/** In-memory copy of whatever `captureRawInitData` found on the very first
 *  read — takes priority over everything below once set. */
let captured: string | undefined;

/**
 * Reads `tgWebAppData` straight from the URL hash Telegram appends when
 * launching the Mini App. We read it directly rather than through the SDK's
 * typed `initData` parser — that parser can reject otherwise-valid initData
 * from clients that omit newer optional fields (e.g. `signature`), and all
 * our backend actually needs is the raw "key=value&..." string to validate
 * the HMAC hash (see apps/server/src/telegram/validateInitData.ts).
 */
function extractFromLocationHash(): string | undefined {
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const raw = params.get("tgWebAppData");
  return raw || undefined;
}

/**
 * Grabs the real raw initData (if any) before anything else touches the
 * page — call this as the very first line of main.tsx, before
 * bootstrapTelegram(). Some real Telegram clients make the SDK's own
 * `init()` throw (a documented issue: a missing `Object.hasOwn` polyfill on
 * older engines breaks its validator — see
 * github.com/Telegram-Mini-Apps/telegram-apps/issues/683), and our fallback
 * for that replaces `window.location.hash` with a fully mocked, fake user
 * so the rest of the UI (theme, buttons) still has something to render.
 * Without capturing the real hash FIRST, that mock overwrite would also
 * poison this module's own fallback (getRawInitData re-reads the live hash
 * on every call), silently swapping the real authenticated user for the
 * fake mock one everywhere the raw string is used — including the socket
 * connection, which otherwise has no reason to fail alongside it.
 */
export function captureRawInitData(): void {
  const fromHash = extractFromLocationHash();
  if (fromHash) {
    captured = fromHash;
    sessionStorage.setItem(STORAGE_KEY, fromHash);
  }
}

/** Returns the raw initData string. Prefers the value locked in by
 *  `captureRawInitData()` at startup; falls back to sessionStorage (survives
 *  client-side navigation, which clears the hash) and finally a fresh read
 *  of the current hash if neither ran yet. */
export function getRawInitData(): string | undefined {
  if (captured) return captured;
  const fromStorage = sessionStorage.getItem(STORAGE_KEY);
  if (fromStorage) return fromStorage;
  return extractFromLocationHash();
}
