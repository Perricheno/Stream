const STORAGE_KEY = "stream:raw-init-data";

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

/** Returns the raw initData string, remembering it in sessionStorage so it survives client-side navigation (which clears the hash). */
export function getRawInitData(): string | undefined {
  const fromHash = extractFromLocationHash();
  if (fromHash) {
    sessionStorage.setItem(STORAGE_KEY, fromHash);
    return fromHash;
  }
  return sessionStorage.getItem(STORAGE_KEY) ?? undefined;
}
