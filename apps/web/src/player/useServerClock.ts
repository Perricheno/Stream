import { useCallback, useEffect, useRef } from "react";
import type { RoomSocket } from "../socket/socketClient";

/** How many round-trip samples to take per calibration pass — Cristian's
 *  algorithm's accuracy comes from keeping only the lowest-RTT sample (least
 *  queuing/jitter along the way), so a few extra samples are cheap insurance
 *  against the first one or two landing on a slow tick. */
const SAMPLES_PER_CALIBRATION = 5;
const SAMPLE_GAP_MS = 150;
/** Re-calibrate periodically, not just once on connect — a phone's own clock
 *  can get stepped by the OS mid-session, and a whole watch session can span
 *  network changes (wifi <-> cellular) that shift RTT and so the offset's
 *  accuracy. Each pass fully replaces the previous offset rather than only
 *  updating it if "better", so a clock step or path change is picked up
 *  immediately instead of being compared against (and losing to) stale data. */
const RECALIBRATION_MS = 30_000;

export interface ServerClock {
  /** Best current estimate of the server's Date.now(), given this client's
   *  own clock plus the measured offset. Equal to the local clock (offset 0)
   *  until the first calibration round completes a few hundred ms after
   *  connecting. Sync math should use this instead of a bare Date.now()
   *  whenever it's being compared against a server-issued timestamp (like
   *  playback.updatedAtServerTime) — otherwise every device's own clock
   *  skew (commonly a full second or more on phones) leaks directly into
   *  the computed playback position, differently per device. */
  serverNow(): number;
}

/** NTP-style ("Cristian's algorithm") clock-offset estimation over the
 *  existing room socket — no dedicated server infrastructure needed, just an
 *  event the server echoes back immediately. True sub-millisecond agreement
 *  isn't physically meaningful here (network jitter alone is usually several
 *  ms, and browsers don't expose finer timing anyway); this gets the offset
 *  as tight as that noise floor allows, which is what actually matters for
 *  keeping playback positions agreeing across devices. */
export function useServerClock(socket: RoomSocket): ServerClock {
  const offsetRef = useRef(0);
  const calibratingRef = useRef(false);

  const calibrate = useCallback(() => {
    if (calibratingRef.current) return;
    calibratingRef.current = true;
    let localBestRtt = Infinity;
    for (let i = 0; i < SAMPLES_PER_CALIBRATION; i += 1) {
      setTimeout(
        () => {
          const t0 = Date.now();
          socket.emit("time:sync", { clientSentAt: t0 }, ({ serverTime }) => {
            const t3 = Date.now();
            const rtt = t3 - t0;
            if (rtt < localBestRtt) {
              localBestRtt = rtt;
              // Assume the one-way trip took half the round trip, so the
              // server's clock read `serverTime` when this client's clock
              // read roughly t0 + rtt/2.
              offsetRef.current = serverTime - (t0 + rtt / 2);
            }
            if (i === SAMPLES_PER_CALIBRATION - 1) calibratingRef.current = false;
          });
        },
        i * SAMPLE_GAP_MS,
      );
    }
  }, [socket]);

  useEffect(() => {
    calibrate();
    const interval = setInterval(calibrate, RECALIBRATION_MS);
    // The gap around a reconnect is exactly when a network-path change (and
    // so a shift in the offset's accuracy) is most likely.
    socket.on("connect", calibrate);
    return () => {
      clearInterval(interval);
      socket.off("connect", calibrate);
    };
  }, [socket, calibrate]);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { serverNow };
}
