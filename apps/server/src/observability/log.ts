/**
 * Structured, greppable logging for room / playback-sync events. Always on —
 * volume is tiny for this app's scale, and being able to reconstruct exactly
 * what the server told each client (and when, against which server clock) is
 * the whole point when a sync bug is reported.
 *
 * Each line: `[room] <event> {json}` with a server timestamp so it can be
 * lined up against a client's own `[sync]` console log (see
 * apps/web/src/player/syncLog.ts).
 */
export function logRoom(event: string, data: Record<string, unknown> = {}): void {
  console.log(`[room] ${event} ${JSON.stringify({ t: Date.now(), ...data })}`);
}
