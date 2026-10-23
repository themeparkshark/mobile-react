import { createContext } from 'react';
import type { WrapUpReason } from './core/session';

/**
 * How a GameKit game treats walking in a queue.
 *   passive (default): THE LINE IS ALWAYS MOVING (Dustin). Walking never
 *     pauses, never locks input, never ends a round. `moving` is only a
 *     signal the game may use (for example a bigger swipe threshold).
 *   pause: an explicit opt-in for a QA preview only. No queue game uses it.
 */
export type LineMovePolicy = 'passive' | 'pause';

/** A just-for-fun win's results card points at the games that pay Bonus Parts. */
export interface JustForFunNote {
  readonly text: string;
  readonly actionLabel: string;
  readonly onPress: () => void;
}

/**
 * Only LinePlay supplies this. QUEUE REALITY: "The line will always be
 * moving." Movement NEVER pauses a game; GameShellV2 shows a gentle heads-up
 * when the line advances a lot, and only a real queue event (boarding or
 * leaving the queue geofence) ends a run via `queueEnded`.
 */
export interface LinePlayMovement {
  /** The line is shuffling forward right now (informational only). */
  readonly moving: boolean;
  /** Legacy hook: LinePlay's resume bookkeeping. Called when play resumes. */
  readonly onResume: () => void;
  readonly lineMovePolicy?: LineMovePolicy;
  /** Set for client-scored games only: their wins never pay Parts (queue-bonus.md 7.5). */
  readonly justForFunNote?: JustForFunNote | null;
  /** Optional: the most recent queue advance (drives the heads-up). */
  readonly lastAdvance?: { readonly at: number; readonly metres?: number } | null;
  /**
   * Optional: a real queue event ended the session ("Your ride's up!"): the
   * wait finished, or the guest said they are boarding. The undoable wrap-up
   * grace (GPS says they left) never sets this while a game is open.
   */
  readonly queueEnded?: WrapUpReason | null;
  /**
   * Optional: ride detection thinks the guest just boarded. Only a hint (one
   * GPS fix can fake it, indoors most of all), so it never ends a run by
   * itself: an active round keeps playing, and a held round (paused,
   * backgrounded, pocketed) asks "Did your ride start?" inside the game
   * instead of counting down to resume.
   */
  readonly rideUpLikely?: boolean;
  /**
   * Optional: the guest answered that in-game question. true = "SAVE MY RUN"
   * (sent after the saved run's card closes, so the run counts first);
   * false = "KEEP PLAYING" (the hint is cleared).
   */
  readonly onBoardingAnswer?: (boarded: boolean) => void;
  /**
   * Optional: a finished run the shell did not hand to onComplete (no star,
   * a saved partial run, or a run the guest replays with PLAY AGAIN). Without
   * this, such a run looked like it never happened ("Not played this wait").
   * A partial run counts as played but is not a real star.
   */
  readonly onRunDone?: (stars: number, partial: boolean) => void;
}

export const LinePlayMovementContext = createContext<LinePlayMovement | null>(null);

/** Walking pauses a game only when a caller explicitly opted into 'pause'. */
export function shouldPauseForMovement(context: { moving: boolean; lineMovePolicy?: LineMovePolicy } | null): boolean {
  return Boolean(context?.moving && context.lineMovePolicy === 'pause');
}
