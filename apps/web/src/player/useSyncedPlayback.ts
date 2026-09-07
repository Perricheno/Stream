import { useCallback, useEffect, useRef } from "react";
import { computeExpectedPosition, ECHO_SUPPRESSION_MS } from "@stream/shared";
import type { PlaybackState, PlaybackSyncPayload } from "@stream/shared";
import type { RoomSocket } from "../socket/socketClient";
import { isRealTelegramClient } from "../telegram/environment";
import type { PlayerHandle } from "./playerTypes";
import { syncLog } from "./syncLog";
import { useServerClock } from "./useServerClock";

const round = (n: number) => Math.round(n * 1000) / 1000;

export interface SyncedPlayback {
  playerRef: React.RefObject<PlayerHandle>;
  /** Date.now()-comparable timestamp: swallow native play/pause/seeked
   *  events (treat them as an echo of our own command, not a fresh local
   *  action) until this time, not a plain flag or count — see the doc
   *  comment right above where it's read in each adapter for why. */
  suppressed: React.MutableRefObject<number>;
  onPlay: (atSeconds: number) => void;
  onPause: (atSeconds: number) => void;
  onSeek: (atSeconds: number) => void;
  /** Signals a genuine network/buffering stall (not a sync correction) —
   *  drift correction suppresses itself while this is true, see below. */
  onBuffering: (isBuffering: boolean) => void;
  /** For a host's autoplay-on-source-change effect: commands local playback
   *  AND reports it to the server in the same call, instead of leaving the
   *  server report to the player's own native "play" event — for YouTube/
   *  Vimeo that event only fires once their iframe finishes a multi-second
   *  load handshake, so relying on it stamps the room's canonical "started
   *  playing" moment several seconds later than it actually did, silently
   *  rewinding everyone else's synced position by that same gap the moment
   *  that late event arrives. */
  startPlaybackNow: (atSeconds: number) => void;
}

/** Below this, do nothing at all — avoids chasing ordinary getCurrentTime()
 *  jitter (media clocks and JS timing aren't perfectly precise even when
 *  genuinely in sync). Small enough to still catch the gap that actually
 *  keeps showing up here: whoever's action (play/pause/seek) triggers it
 *  applies to their own player at zero latency, while everyone else is
 *  reacting to a broadcast that took a real network round trip to arrive —
 *  a persistent tens-to-couple-hundred-ms gap that a more generous
 *  tolerance would just never touch. */
const DRIFT_DEADZONE_SECONDS = 0.12;
/** Beyond this much drift, a rate nudge would take too long to catch up — hard-seek instead. */
const SOFT_CORRECTION_MAX_SECONDS = 5;
/** The rate nudge scales with how far off the drift actually is, instead of
 *  one fixed speed for "anything correctable" — a bare-minimum bump right at
 *  the edge of the deadzone (imperceptible even in principle) up to a
 *  firmer one as drift approaches the hard-seek threshold, so a 150ms gap
 *  isn't stuck taking as long to close as it'd take to close 4 seconds of
 *  drift, and a multi-second gap doesn't dawdle at a speed tuned for
 *  barely-there drift. Both ends are still well within what browsers
 *  pitch-correct automatically, so neither end is audible as a pitch shift. */
const SOFT_CORRECTION_MIN_RATE_DELTA = 0.03;
const SOFT_CORRECTION_MAX_RATE_DELTA = 0.18;
function correctionRateDelta(absDriftSeconds: number): number {
  const span = SOFT_CORRECTION_MAX_SECONDS - DRIFT_DEADZONE_SECONDS;
  const t = span > 0 ? Math.min(1, (absDriftSeconds - DRIFT_DEADZONE_SECONDS) / span) : 1;
  return SOFT_CORRECTION_MIN_RATE_DELTA + t * (SOFT_CORRECTION_MAX_RATE_DELTA - SOFT_CORRECTION_MIN_RATE_DELTA);
}
/** For players that only honor a fixed set of rates (see PlayerHandle.
 *  supportsFinePlaybackRate's doc comment) — 0.25 is the nearest step away
 *  from 1 in that set (0.75/1.25), so it's the smallest correction that
 *  actually takes effect instead of silently rounding back to 1. Applied for
 *  as short a burst as the drift needs (the settle-check below stops it the
 *  moment it's caught up), so even this coarser nudge stays brief. */
const COARSE_CORRECTION_RATE_DELTA = 0.25;
/** How close the correction has to close the gap before it's considered
 *  settled — tight enough that "corrected" actually means "in sync", not
 *  "still visibly behind but no longer getting worse". */
const SOFT_CORRECTION_SETTLE_SECONDS = 0.05;
/** How often the active correction checks whether it's settled — frequent
 *  enough to stop right on target instead of overshooting past dead-on sync
 *  now that the rate nudge itself can be considerably faster. */
const SOFT_CORRECTION_CHECK_MS = 200;
/** How often to re-check drift against the last known state even with no
 *  new event — a stall (buffering, the tab freezing for a moment), or the
 *  small everyone-but-the-sender gap described above, otherwise only gets
 *  corrected whenever some unrelated action happens to trigger a fresh
 *  playback:sync, which might not be for a long time. */
const PERIODIC_RECHECK_MS = 1000;
/** A freshly-mounted YouTube/Vimeo player can take far longer than one
 *  frame to become controllable (loading the iframe API, the postMessage
 *  handshake) — retry applying the room's current state at this interval
 *  until the player actually exists, instead of trying exactly once and
 *  silently giving up if that one attempt was too early. */
const INITIAL_SYNC_RETRY_MS = 200;
const INITIAL_SYNC_MAX_ATTEMPTS = 50; // ~10s
/** How long to swallow native play/pause/seeked confirmation events after an
 *  already-loaded player is commanded — its events fire essentially
 *  immediately in response, so this only needs to be generous enough to
 *  absorb that, not so long a genuine follow-up action shortly after gets
 *  swallowed too. */
const STEADY_STATE_SUPPRESSION_MS = 500;
/** Same, but for a command issued to a player that hasn't loaded yet (the
 *  very first play, or any seekTo — seeking to a not-yet-buffered position
 *  can trigger a rebuffer). Confirmed empirically that this doesn't produce
 *  one clean confirming event but an unpredictable-length cascade (a "play"
 *  followed by one or more "seeked" events as buffering catches back up) —
 *  a fixed *count* of expected echoes proved unreliable (sometimes 1 trailing
 *  event, sometimes more), so this covers the whole cascade by time instead
 *  of trying to guess how many events it produces. */
const COLD_START_SUPPRESSION_MS = 4000;

/**
 * Bridges a `VideoPlayer` and the room socket: applies incoming `playback:sync`
 * corrections (host-authoritative, server-timestamped) and forwards local user
 * actions back to the server. See packages/shared/src/sync.ts for the model.
 */
export function useSyncedPlayback(socket: RoomSocket, initialPlayback: PlaybackState | null): SyncedPlayback {
  const playerRef = useRef<PlayerHandle>(null);
  const suppressed = useRef(0);
  const lastLocalActionAt = useRef(0);
  const correctionInterval = useRef<ReturnType<typeof setInterval>>();
  const lastKnownStateRef = useRef<PlaybackState | null>(initialPlayback);
  const isBufferingRef = useRef(false);
  // What we last actually told the player to do — not what the room's state
  // says, since applyServerState re-runs constantly (every periodic recheck)
  // with an unchanged isPlaying. Without this, each of those re-runs would
  // re-issue play()/pause() and re-increment `suppressed` for a command that
  // was already sent, and since a still-loading player only ever fires ONE
  // real confirming event no matter how many times play() is queued against
  // it, the count would inflate and never fully unwind — permanently
  // swallowing this client's own future local actions. null right after a
  // fresh player mount ensures the first real sync is never treated as "no
  // change needed".
  const lastCommandedPlayingRef = useRef<boolean | null>(null);
  const preBackgroundSuppressedRef = useRef(0);
  const { serverNow } = useServerClock(socket);

  const stopSoftCorrection = useCallback(() => {
    if (correctionInterval.current) {
      clearInterval(correctionInterval.current);
      correctionInterval.current = undefined;
      playerRef.current?.setPlaybackRate(1);
    }
  }, []);

  useEffect(() => stopSoftCorrection, [stopSoftCorrection]);

  const onBuffering = useCallback(
    (isBuffering: boolean) => {
      if (isBufferingRef.current !== isBuffering) {
        syncLog("buffering", { isBuffering, at: round(playerRef.current?.getCurrentTime() ?? 0) });
      }
      isBufferingRef.current = isBuffering;
      // A rate nudge assumes normal playback is progressing — pointless (and
      // visually confusing) to leave one running once the player itself has
      // stopped consuming time due to a stall. Drift correction stays
      // suppressed the whole time isBufferingRef is true (see the guard in
      // applyServerState and the soft-correction interval); the periodic
      // recheck (PERIODIC_RECHECK_MS) closes the gap the stall opened within
      // ~1s of data coming back.
      if (isBuffering) stopSoftCorrection();
    },
    [stopSoftCorrection],
  );

  const applyServerState = useCallback((payload: PlaybackState, forceSeek = false) => {
    lastKnownStateRef.current = payload;
    const player = playerRef.current;
    if (!player) {
      syncLog("apply:skip", { reason: "no-player", forceSeek });
      return;
    }
    if (Date.now() - lastLocalActionAt.current < ECHO_SUPPRESSION_MS) {
      syncLog("apply:skip", { reason: "echo-suppressed", sinceLocalMs: Date.now() - lastLocalActionAt.current });
      return;
    }

    stopSoftCorrection();

    // Nothing meaningful to correct against yet — getCurrentTime() reads a
    // flat 0 the whole time this player is still loading, regardless of
    // anything already queued against it, so treating that as "genuinely
    // behind" would seek it toward a growing target on every periodic
    // recheck, queuing a pile of conflicting commands that all fire in a
    // burst (and can stall-seek-stall each other) the moment it finally
    // loads. Once it has loaded, its own real position takes over here
    // immediately (the next recheck is at most PERIODIC_RECHECK_MS away).
    const hasLoaded = player.hasLoadedMetadata();

    // A genuine network stall: seeking or nudging the rate while the player
    // is already starved for data just restarts its buffering at a new
    // position, risking a stall-seek-stall loop instead of letting the
    // browser recover on its own. play()/pause() below still always reflect
    // the real command regardless — only the drift-closing part backs off.
    if (isBufferingRef.current || !hasLoaded) {
      syncLog("apply:defer-correction", { buffering: isBufferingRef.current, hasLoaded });
    }

    if (!isBufferingRef.current && hasLoaded) {
      // Clamp to the video's real length: the shared timeline keeps advancing
      // `positionSeconds` from a server timestamp with no knowledge of
      // duration, so once a video plays past its end with nothing next in the
      // queue, an unclamped "expected" grows without bound and this code
      // hard-seeks the player past the end every recheck.
      const duration = player.getDuration();
      const rawExpected = computeExpectedPosition(payload, serverNow());
      const expected = duration > 0 ? Math.min(rawExpected, duration) : rawExpected;
      const atEnd = duration > 0 && rawExpected >= duration - 0.25;
      const current = player.getCurrentTime();
      const drift = current - expected;
      const absDrift = Math.abs(drift);
      syncLog("apply:drift", {
        isPlaying: payload.isPlaying,
        current: round(current),
        expected: round(expected),
        rawExpected: round(rawExpected),
        duration: round(duration),
        drift: round(drift),
        forceSeek,
        atEnd,
      });

      // The room thinks it's still playing but the video has run out — don't
      // fight the ended player with seeks/rate nudges; just let it sit.
      if (atEnd) {
        syncLog("apply:at-end", { current: round(current), duration: round(duration) });
        stopSoftCorrection();
        lastCommandedPlayingRef.current = false;
        return;
      }

      if (forceSeek || absDrift > SOFT_CORRECTION_MAX_SECONDS) {
        syncLog("correct:seek", { from: round(current), to: round(expected), reason: forceSeek ? "force" : "far-drift" });
        // Too far off for a rate nudge to close in reasonable time — jump.
        // Also always true for the very first sync a freshly-mounted player
        // gets (join, or switching videos): there's no continuous playback
        // experience to protect yet, so even a sub-5s gap should snap
        // immediately instead of crawling shut over tens of seconds — a
        // guest joining mid-playback must start dead-on, not slowly drift
        // into sync while visibly lagging the whole time.
        //
        // Cold-start window, not the steady-state one: seeking to a not-yet-
        // buffered position can trigger a rebuffer-then-resume cascade of its
        // own, regardless of whether the player has loaded before.
        suppressed.current = Date.now() + COLD_START_SUPPRESSION_MS;
        player.seekTo(expected);
      } else if (absDrift > DRIFT_DEADZONE_SECONDS && payload.isPlaying) {
        // Gently speed up/slow down instead of a hard jump-cut — the whole
        // point being nobody notices this happening, unlike a visible seek.
        const rateDelta = player.supportsFinePlaybackRate()
          ? correctionRateDelta(absDrift)
          : COARSE_CORRECTION_RATE_DELTA;
        const rate = drift < 0 ? 1 + rateDelta : 1 - rateDelta;
        syncLog("correct:rate", { drift: round(drift), rate: round(rate) });
        player.setPlaybackRate(rate);
        correctionInterval.current = setInterval(() => {
          if (isBufferingRef.current) return;
          const current = playerRef.current;
          if (!current) {
            stopSoftCorrection();
            return;
          }
          const stillExpected = computeExpectedPosition(payload, serverNow());
          if (Math.abs(current.getCurrentTime() - stillExpected) <= SOFT_CORRECTION_SETTLE_SECONDS) {
            stopSoftCorrection();
          }
        }, SOFT_CORRECTION_CHECK_MS);
      }
    }

    // Only re-issue play()/pause() on a real transition — applyServerState
    // re-runs on every periodic recheck with an unchanged isPlaying, and
    // re-sending it every tick would extend the suppression window forever,
    // permanently swallowing this client's own future local actions. See
    // lastCommandedPlayingRef's doc comment.
    if (lastCommandedPlayingRef.current !== payload.isPlaying) {
      const isFirstCommand = lastCommandedPlayingRef.current === null;
      lastCommandedPlayingRef.current = payload.isPlaying;
      const window = hasLoaded ? STEADY_STATE_SUPPRESSION_MS : COLD_START_SUPPRESSION_MS;
      syncLog("command", { to: payload.isPlaying ? "play" : "pause", hasLoaded, isFirstCommand });
      if (payload.isPlaying) {
        suppressed.current = Date.now() + window;
        player.play();
      } else if (!isFirstCommand) {
        // A freshly-mounted player already starts paused (no autoplay
        // attribute is ever set) — an explicit pause() for the very first
        // sync wouldn't change anything anyway, but CAN race a host's
        // near-simultaneous autoplay effect (RoomScreen.tsx's own
        // startPlaybackNow call): both queue against the same not-yet-
        // loaded element, and their relative execution order once it
        // finally loads isn't something to rely on — losing that race
        // left the video paused indefinitely instead of autoplaying.
        suppressed.current = Date.now() + window;
        player.pause();
      }
    }
  }, [stopSoftCorrection, serverNow]);

  // A real Telegram client commonly gets a backgrounded WebView's video
  // auto-paused by the OS itself — not a user action — and for the host
  // specifically, reporting that as a genuine pause would stop the room for
  // every other participant just because the host's app went to the
  // background. Suppress the whole time it's hidden; coming back to the
  // foreground restores whatever suppression window was already in effect
  // (rather than clearing it outright), so this can't cut a genuinely
  // in-progress cold-start window short if backgrounding happens to overlap
  // with one.
  //
  // A plain browser tab (running this as a standalone website, or `pnpm dev`)
  // is different: an already-playing, user-started video keeps advancing
  // (with audio) in a backgrounded tab — that's the browser's own autoplay
  // policy, not something to fight — so drift correction stays active there
  // instead of silently going stale for however long the tab stays hidden;
  // coming back just forces one immediate resync (rather than waiting up to
  // PERIODIC_RECHECK_MS) in case a throttled background timer let it drift.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!isRealTelegramClient()) {
        if (document.visibilityState === "visible") {
          const state = lastKnownStateRef.current;
          if (state) applyServerState(state, true);
        }
        return;
      }
      if (document.visibilityState === "hidden") {
        preBackgroundSuppressedRef.current = suppressed.current;
        suppressed.current = Infinity;
      } else {
        suppressed.current = preBackgroundSuppressedRef.current;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [applyServerState]);

  useEffect(() => {
    const handleSync = (payload: PlaybackSyncPayload) => applyServerState(payload);
    socket.on("playback:sync", handleSync);
    return () => {
      socket.off("playback:sync", handleSync);
    };
  }, [socket, applyServerState]);

  useEffect(() => {
    lastKnownStateRef.current = initialPlayback;
    // A fresh player (room join, or switching to a new video) hasn't been
    // told anything yet regardless of what the room's last state happened
    // to be, so the very next sync must always be treated as a real
    // transition — see lastCommandedPlayingRef's doc comment.
    lastCommandedPlayingRef.current = null;
    if (!initialPlayback) return;
    let cancelled = false;
    let attempts = 0;

    const tryApply = () => {
      if (cancelled) return;
      if (playerRef.current?.isReady()) {
        syncLog("initial-sync", { after: attempts, state: lastKnownStateRef.current });
        // lastKnownStateRef.current, not the closure-captured initialPlayback
        // — the retry loop below can take up to INITIAL_SYNC_MAX_ATTEMPTS *
        // INITIAL_SYNC_RETRY_MS (~10s) to actually fire, and a host's own
        // autoplay effect commanding playback in the meantime (updating
        // lastKnownStateRef via emit()) is exactly the kind of local action
        // this should reflect, not overwrite with a stale "before that
        // happened" snapshot from whenever this effect was first declared.
        applyServerState(lastKnownStateRef.current ?? initialPlayback, true);
        return;
      }
      attempts += 1;
      if (attempts >= INITIAL_SYNC_MAX_ATTEMPTS) return;
      setTimeout(tryApply, INITIAL_SYNC_RETRY_MS);
    };
    tryApply();
    return () => {
      cancelled = true;
    };
  }, [initialPlayback, applyServerState]);

  // Self-heals drift on a timer instead of only ever reacting to someone
  // else's action — without this, one client's stall/buffer had nothing
  // to correct it until the next unrelated play/pause/seek happened
  // anywhere in the room, which could be minutes away or might never come
  // if playback just runs uninterrupted start to finish.
  useEffect(() => {
    const interval = setInterval(() => {
      const state = lastKnownStateRef.current;
      if (state) applyServerState(state);
    }, PERIODIC_RECHECK_MS);
    return () => clearInterval(interval);
  }, [applyServerState]);

  // Reports this client's own drift/buffering state for the participants
  // list's sync-health dots — purely informational, doesn't feed back into
  // the correction logic above at all (see sync:report's doc comment).
  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      const state = lastKnownStateRef.current;
      if (!player?.isReady() || !state) return;
      const expected = computeExpectedPosition(state, serverNow());
      socket.emit("sync:report", {
        driftSeconds: player.getCurrentTime() - expected,
        isBuffering: isBufferingRef.current,
      });
    }, PERIODIC_RECHECK_MS);
    return () => clearInterval(interval);
  }, [socket, serverNow]);

  const emit = useCallback(
    (type: "play" | "pause" | "seek", atSeconds: number) => {
      // A fresh local action means the user just took over — don't let a
      // stale rate-nudge from an earlier correction keep running against it.
      stopSoftCorrection();
      lastLocalActionAt.current = Date.now();
      // The server never echoes an action back to whoever sent it (only to
      // everyone ELSE in the room), so without this, the sender's own
      // lastKnownStateRef would keep pointing at whatever the room's state
      // was BEFORE this action (e.g. still "paused at 0" right after the
      // host presses play) — and the periodic self-check a few lines down
      // would then "correct" the sender's own, actually-correct player back
      // to that stale snapshot on its next tick. Mirroring the server's own
      // update here (see registerSocketHandlers.ts's applyPlayback) keeps it
      // accurate immediately, locally, without waiting on a round trip that
      // isn't coming.
      const isPlaying = type === "seek" ? (lastKnownStateRef.current?.isPlaying ?? true) : type === "play";
      lastKnownStateRef.current = { isPlaying, positionSeconds: atSeconds, updatedAtServerTime: serverNow() };
      syncLog("local", { type, atSeconds: round(atSeconds), isPlaying });
      socket.emit(`playback:${type}`, { atSeconds, clientTimestamp: Date.now() });
    },
    [socket, stopSoftCorrection, serverNow],
  );

  const onPlay = useCallback((atSeconds: number) => emit("play", atSeconds), [emit]);
  const onPause = useCallback((atSeconds: number) => emit("pause", atSeconds), [emit]);
  const onSeek = useCallback((atSeconds: number) => emit("seek", atSeconds), [emit]);

  const startPlaybackNow = useCallback(
    (atSeconds: number) => {
      const player = playerRef.current;
      if (!player) return;
      // Set before calling play() (and before emit(), which is what actually
      // gates out the redundant applyServerState calls below via
      // ECHO_SUPPRESSION_MS) so that even if a periodic recheck slips in
      // before that gate kicks in, it sees "already commanded" and doesn't
      // double up — see lastCommandedPlayingRef's doc comment.
      lastCommandedPlayingRef.current = true;
      // Cold-start window — this is always a fresh, not-yet-loaded player by
      // definition (see this function's own doc comment).
      suppressed.current = Date.now() + COLD_START_SUPPRESSION_MS;
      syncLog("startPlaybackNow", { atSeconds: round(atSeconds) });
      player.play();
      emit("play", atSeconds);
    },
    [emit],
  );

  return { playerRef, suppressed, onPlay, onPause, onSeek, onBuffering, startPlaybackNow };
}
