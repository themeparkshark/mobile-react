import { createContext } from 'react';

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

/** Only LinePlay supplies this; other GameKit callers keep their own pause controls. */
export const LinePlayMovementContext = createContext<{
  readonly moving: boolean;
  readonly onResume: () => void;
  readonly lineMovePolicy?: LineMovePolicy;
  /** Set for client-scored games only: their wins never pay Parts (queue-bonus.md 7.5). */
  readonly justForFunNote?: JustForFunNote | null;
} | null>(null);

/** Walking pauses a game only when a caller explicitly opted into 'pause'. */
export function shouldPauseForMovement(context: { moving: boolean; lineMovePolicy?: LineMovePolicy } | null): boolean {
  return Boolean(context?.moving && context.lineMovePolicy === 'pause');
}
