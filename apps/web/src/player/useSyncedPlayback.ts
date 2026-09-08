import { useCallback, useEffect, useRef, useState } from "react";
import { computeExpectedPosition, ECHO_SUPPRESSION_MS } from "@stream/shared";
import type { PlaybackState, PlaybackSyncPayload } from "@stream/shared";
import type { RoomSocket } from "../socket/socketClient";
import type { PlayerHandle } from "./playerTypes";
import { planPlaybackCorrection } from "./playbackCorrection";
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
  /** True when the room is playing but this browser refused to start the
   *  video without a gesture (autoplay policy), or drift correction gave up
   *  after repeated no-op seeks against a stuck-paused player. VideoPlayer
   *  shows a full-cover "tap to watch" layer; tapping it calls retryPlay
   *  inside the gesture, which is enough to unlock playback for the session. */
  playBlocked: boolean;
  /** The adapter reported NotAllowedError up — flip the gate on. */
  notePlayBlocked: () => void;
  /** Called from the "tap to watch" layer's click handler. */
  retryPlay: () => void;
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
/** Minimum gap between re-issuing the same play/pause command when the
 *  player's actual state still doesn't match what the room wants — often
 *  enough to catch a lost first play, rare enough not to hammer the element
 *  (or keep extending the suppression window). */
const COMMAND_RETRY_MS = 2000;
/** After this many consecutive hard seeks that didn't move the player at all
 *  (it's stuck — usually paused because play() was blocked), stop seeking and
 *  raise the "tap to watch" gate instead of dragging the frame once a second. */
const MAX_INEFFECTIVE_SEEKS = 3;
/** How long the tab has to stay hidden before we pause the room for it — a
 *  quick app-switch / notification-shade peek shouldn't stop everyone. */
const AWAY_PAUSE_DELAY_MS = 2000;

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
  const commandRetryAtRef = useRef(0);
  const ineffectiveSeekRef = useRef({ count: 0, lastCurrent: -1 });
  const [playBlocked, setPlayBlocked] = useState(false);
  const playBlockedRef = useRef(false);
  const preBackgroundSuppressedRef = useRef(0);
  // Whether this player has ever received a forced, snap-to-position sync.
  // A `library` video's player only mounts once its import finishes and a
  // stream token is fetched, which can easily take longer than the initial
  // retry loop below is willing to wait — so the periodic recheck also
  // force-syncs the first time it finds a ready player, however late that is.
  // Without it, joining before the player exists left the video unsynced
  // until somebody happened to press play.
  const initialSyncDoneRef = useRef(false);
  const { serverNow } = useServerClock(socket);

  const stopSoftCorrection = useCallback(() => {
    if (correctionInterval.current) {
      clearInterval(correctionInterval.current);
      correctionInterval.current = undefined;
      playerRef.current?.setPlaybackRate(1);
    }
  }, []);

  useEffect(() => stopSoftCorrection, [stopSoftCorrection]);

  const raisePlayGate = useCallback(() => {
    if (playBlockedRef.current) return;
    playBlockedRef.current = true;
    stopSoftCorrection();
    setPlayBlocked(true);
  }, [stopSoftCorrection]);

  const clearPlayGate = useCallback(() => {
    if (!playBlockedRef.current) return;
    playBlockedRef.current = false;
    ineffectiveSeekRef.current = { count: 0, lastCurrent: -1 };
    setPlayBlocked(false);
  }, []);

  const notePlayBlocked = useCallback(() => raisePlayGate(), [raisePlayGate]);

  const retryPlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    syncLog("play-gate:retry");
    // This runs inside the layer's click handler, so the browser treats it
    // as a user gesture and unblocks playback for the rest of the session.
    void player
      .play()
      .then(() => clearPlayGate())
      .catch(() => {
        /* still blocked (or a real error) — leave the gate up */
      });
  }, [clearPlayGate]);

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
    const playerPaused = hasLoaded && player.isPaused();
    const duration = player.getDuration();
    const rawExpected = computeExpectedPosition(payload, serverNow());
    const expected = duration > 0 ? Math.min(rawExpected, duration) : rawExpected;
    const current = player.getCurrentTime();

    // Playback is genuinely running again (host resumed, or the tap worked) —
    // drop the "tap to watch" gate.
    if (playBlockedRef.current && hasLoaded && !playerPaused) clearPlayGate();

    const plan = planPlaybackCorrection({
      roomIsPlaying: payload.isPlaying,
      hasLoaded,
      isBuffering: isBufferingRef.current,
      playerPaused,
      playBlocked: playBlockedRef.current,
      current,
      expected,
      atEnd: duration > 0 && rawExpected >= duration - 0.25,
      forceSeek,
      lastCommandedPlaying: lastCommandedPlayingRef.current,
      msSinceLastCommand: Date.now() - commandRetryAtRef.current,
      commandRetryMs: COMMAND_RETRY_MS,
      driftDeadzoneSeconds: DRIFT_DEADZONE_SECONDS,
      softCorrectionMaxSeconds: SOFT_CORRECTION_MAX_SECONDS,
    });

    syncLog("apply", {
      isPlaying: payload.isPlaying,
      current: round(current),
      expected: round(expected),
      drift: round(current - expected),
      hasLoaded,
      playerPaused,
      playStalled: plan.playStalled,
      drift_action: plan.drift,
      command: plan.command,
      forceSeek,
    });

    // --- position correction ---
    if (plan.drift === "atEnd") {
      // The room thinks it's still playing but the video has run out — don't
      // fight the finished player with seeks/rate nudges; just let it sit.
      stopSoftCorrection();
      lastCommandedPlayingRef.current = false;
      return;
    }
    if (plan.drift === "seek") {
      // Give up seeking if it keeps landing on the same spot — the player
      // isn't actually consuming time (stuck paused, usually a blocked
      // play()), so a once-a-second seek is just the slideshow again.
      const stuck = ineffectiveSeekRef.current;
      if (!forceSeek && Math.abs(current - stuck.lastCurrent) < 0.25) stuck.count += 1;
      else stuck.count = 0;
      stuck.lastCurrent = current;
      if (stuck.count >= MAX_INEFFECTIVE_SEEKS) {
        syncLog("correct:seek-ineffective", { stuckAt: round(current), target: round(expected) });
        raisePlayGate();
        return;
      }
      syncLog("correct:seek", { from: round(current), to: round(expected), reason: forceSeek ? "force" : "far-drift" });
      // Cold-start window, not the steady-state one: seeking to a not-yet-
      // buffered position can trigger a rebuffer-then-resume cascade.
      suppressed.current = Date.now() + COLD_START_SUPPRESSION_MS;
      player.seekTo(expected);
    } else if (plan.drift === "rate") {
      ineffectiveSeekRef.current.count = 0;
      const absDrift = Math.abs(current - expected);
      const rateDelta = player.supportsFinePlaybackRate() ? correctionRateDelta(absDrift) : COARSE_CORRECTION_RATE_DELTA;
      const rate = current - expected < 0 ? 1 + rateDelta : 1 - rateDelta;
      syncLog("correct:rate", { drift: round(current - expected), rate: round(rate) });
      player.setPlaybackRate(rate);
      correctionInterval.current = setInterval(() => {
        if (isBufferingRef.current) return;
        const p = playerRef.current;
        if (!p) {
          stopSoftCorrection();
          return;
        }
        const stillExpected = computeExpectedPosition(payload, serverNow());
        if (Math.abs(p.getCurrentTime() - stillExpected) <= SOFT_CORRECTION_SETTLE_SECONDS) stopSoftCorrection();
      }, SOFT_CORRECTION_CHECK_MS);
    }

    // --- play()/pause() (re)issue ---
    if (plan.command) {
      lastCommandedPlayingRef.current = payload.isPlaying;
      commandRetryAtRef.current = Date.now();
      const window = hasLoaded ? STEADY_STATE_SUPPRESSION_MS : COLD_START_SUPPRESSION_MS;
      syncLog(plan.isRetry ? "command:retry" : "command", {
        to: plan.command,
        hasLoaded,
        isFirstCommand: plan.isFirstCommand,
      });
      suppressed.current = Date.now() + window;
      if (plan.command === "play") {
        void player.play().catch(() => {
          // NotAllowedError → the adapter raised the gate via onPlayBlocked.
        });
      } else {
        player.pause();
      }
    } else if (plan.isFirstCommand && lastCommandedPlayingRef.current === null) {
      // First sync, room paused, nothing to command — but record that we've
      // now "seen" the desired state so a later real transition still fires.
      lastCommandedPlayingRef.current = payload.isPlaying;
    }
  }, [stopSoftCorrection, serverNow, clearPlayGate, raisePlayGate]);

  /**
   * Going away pauses the room for everyone.
   *
   * This used to do the opposite: a backgrounded WebView gets its video
   * auto-paused by the OS, and that was deliberately hidden from the room so
   * one person's app switch wouldn't stop the others. That's the wrong
   * trade for watching together — the shared timeline kept advancing while
   * somebody genuinely couldn't see it (Telegram's WebView has no
   * Picture-in-Picture to fall back on), so they came back to a video that
   * had run on without them and got snapped forward past what they missed.
   *
   * Pausing is open to any participant for exactly this reason (see
   * playback:request-pause). The server picks the position from its own
   * clock, since this player is already suspended and its currentTime is
   * behind. Suppression still covers the player's own OS-induced pause event
   * so it doesn't race a second, staler pause into the room; coming back
   * restores whatever window was in effect and forces one resync.
   *
   * The exception is real Picture-in-Picture (a browser, not the Telegram
   * WebView): the page is hidden but the video is visibly floating, so they
   * are still watching and nothing should stop.
   */
  useEffect(() => {
    let awayTimer: ReturnType<typeof setTimeout> | undefined;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (document.pictureInPictureElement) return;
        preBackgroundSuppressedRef.current = suppressed.current;
        suppressed.current = Infinity;
        // Don't pause the room for a quick tab flick — only if we're still
        // gone a couple of seconds later (a real "switched away").
        if (awayTimer) clearTimeout(awayTimer);
        awayTimer = setTimeout(() => {
          if (document.visibilityState === "hidden" && lastKnownStateRef.current?.isPlaying) {
            syncLog("away:request-pause");
            socket.emit("playback:request-pause", { reason: "away" });
          }
        }, AWAY_PAUSE_DELAY_MS);
        return;
      }
      if (awayTimer) {
        clearTimeout(awayTimer);
        awayTimer = undefined;
      }
      suppressed.current = preBackgroundSuppressedRef.current;
      const state = lastKnownStateRef.current;
      if (state) applyServerState(state, true);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (awayTimer) clearTimeout(awayTimer);
    };
  }, [applyServerState, socket]);

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
    initialSyncDoneRef.current = false;
    if (!initialPlayback) return;
    let cancelled = false;
    let attempts = 0;

    const tryApply = () => {
      if (cancelled) return;
      if (playerRef.current?.isReady()) {
        syncLog("initial-sync", { after: attempts, state: lastKnownStateRef.current });
        initialSyncDoneRef.current = true;
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
      if (!state) return;
      // First time we see a ready player, snap to position rather than
      // gently nudging — see initialSyncDoneRef. Covers players that mount
      // long after the initial retry loop above gave up (a library video
      // that was still importing when the room was joined).
      if (!initialSyncDoneRef.current && playerRef.current?.isReady()) {
        initialSyncDoneRef.current = true;
        syncLog("initial-sync:late", { state });
        applyServerState(state, true);
        return;
      }
      applyServerState(state);
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
      commandRetryAtRef.current = Date.now();
      // Cold-start window — this is always a fresh, not-yet-loaded player by
      // definition (see this function's own doc comment).
      suppressed.current = Date.now() + COLD_START_SUPPRESSION_MS;
      syncLog("startPlaybackNow", { atSeconds: round(atSeconds) });
      void player.play().catch(() => {
        // NotAllowedError → adapter raised the gate via onPlayBlocked.
      });
      emit("play", atSeconds);
    },
    [emit],
  );

  return { playerRef, suppressed, onPlay, onPause, onSeek, onBuffering, startPlaybackNow, playBlocked, notePlayBlocked, retryPlay };
}
