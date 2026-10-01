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
  /** Optional: a real queue event ended the session ("Your ride's up!"). */
  readonly queueEnded?: WrapUpReason | null;
}

export const LinePlayMovementContext = createContext<LinePlayMovement | null>(null);

/** Walking pauses a game only when a caller explicitly opted into 'pause'. */
export function shouldPauseForMovement(context: { moving: boolean; lineMovePolicy?: LineMovePolicy } | null): boolean {
  return Boolean(context?.moving && context.lineMovePolicy === 'pause');
}
