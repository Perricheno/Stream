/** Accepts either a full invite link (`t.me/<bot>?startapp=room_XXXX`) or a bare room code, as scanned from a QR code or pasted by hand. */
export function parseRoomCodeFromScan(raw: string): string | null {
  const trimmed = raw.trim();
  const startAppMatch = trimmed.match(/startapp=room_([A-Za-z0-9]+)/i);
  if (startAppMatch) return startAppMatch[1].toUpperCase();

  if (/^[A-Za-z0-9]{4,10}$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}
