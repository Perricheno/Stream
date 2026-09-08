/**
 * The pure decision at the heart of useSyncedPlayback: given the room's
 * desired playback state and the local player's ACTUAL state, what should
 * this client do — jump the position, nudge the rate, (re)issue play/pause,
 * or nothing.
 *
 * Extracted so the one rule that kept breaking is directly testable: when
 * the room is playing but this player is actually paused (a blocked or lost
 * play()), NEVER seek — a seekTo on a paused <video> just repaints one
 * frame, and the periodic recheck does it again a second later, forever
 * ("the slideshow"). Re-issue play() instead.
 */

export interface CorrectionInput {
  roomIsPlaying: boolean;
  hasLoaded: boolean;
  isBuffering: boolean;
  /** player.isPaused() — meaningful only once hasLoaded. */
  playerPaused: boolean;
  /** The "tap to watch" gate is up — a timer-driven play() would just be
   *  refused again, so hold everything until the user taps. */
  playBlocked: boolean;
  current: number;
  /** computeExpectedPosition, already clamped to the video's duration. */
  expected: number;
  /** rawExpected has run past the end of the video. */
  atEnd: boolean;
  /** This is a first/forced snap (join, source switch, tab-resume). */
  forceSeek: boolean;
  lastCommandedPlaying: boolean | null;
  msSinceLastCommand: number;
  commandRetryMs: number;
  driftDeadzoneSeconds: number;
  softCorrectionMaxSeconds: number;
}

export interface CorrectionPlan {
  /** Room says play, player is actually paused — the state that must never seek. */
  playStalled: boolean;
  /** "atEnd": leave the finished player alone. "seek": hard jump. "rate":
   *  soft nudge. null: within the deadzone / nothing to do. */
  drift: "atEnd" | "seek" | "rate" | null;
  /** play/pause to (re)issue against the element, or null. */
  command: "play" | "pause" | null;
  /** The command is a retry of the same state, not a fresh transition. */
  isRetry: boolean;
  /** Nothing has ever been commanded on this player yet. */
  isFirstCommand: boolean;
}

export function planPlaybackCorrection(i: CorrectionInput): CorrectionPlan {
  const playStalled = i.roomIsPlaying && i.hasLoaded && i.playerPaused;

  let drift: CorrectionPlan["drift"] = null;
  if (!i.isBuffering && i.hasLoaded && !playStalled && !i.playBlocked) {
    if (i.atEnd) {
      drift = "atEnd";
    } else {
      const absDrift = Math.abs(i.current - i.expected);
      if (i.forceSeek || absDrift > i.softCorrectionMaxSeconds) {
        drift = "seek";
      } else if (absDrift > i.driftDeadzoneSeconds && i.roomIsPlaying) {
        drift = "rate";
      }
    }
  }

  const isFirstCommand = i.lastCommandedPlaying === null;
  const transition = i.lastCommandedPlaying !== i.roomIsPlaying;
  const observedMatchesDesired = i.hasLoaded
    ? i.playerPaused !== i.roomIsPlaying
    : i.lastCommandedPlaying === i.roomIsPlaying;
  const retryDue = !observedMatchesDesired && i.msSinceLastCommand >= i.commandRetryMs;

  let command: CorrectionPlan["command"] = null;
  let isRetry = false;
  if ((transition || retryDue) && !i.playBlocked && drift !== "atEnd") {
    if (i.roomIsPlaying) {
      command = "play";
    } else if (!isFirstCommand) {
      command = "pause";
    }
    isRetry = !transition;
  }

  return { playStalled, drift, command, isRetry, isFirstCommand };
}
