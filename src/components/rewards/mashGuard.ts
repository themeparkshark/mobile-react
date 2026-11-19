/**
 * The input lock on every result, try and win card (fix round W3, T046; hold-2). A card's buttons sit
 * where the game's targets were a moment ago, so a kid still tapping the holes would press TRY AGAIN
 * (and spend a Ticket) or NEXT COIN without ever seeing the card.
 *
 * The buttons wake only once the card has been up RESULT_INPUT_LOCK_MS and the player has stopped
 * tapping for RESULT_QUIET_MS: a tap that lands while the card is locked pushes the wake time to
 * now + RESULT_QUIET_MS. Both are longer than a steady once-a-second tapper's gap (checker 2 saw a
 * 600 ms lock let that kid spend 4 Tickets in 4 minutes), so a finger that keeps the game's rhythm
 * never presses a button; a player who stops and looks presses it the first time. While locked the
 * buttons show dimmed (useResultInputLock), so a press that waits is never a silent dead tap.
 * Pure, no React.
 */

/** How long a result card's buttons sleep after the card appears. */
export const RESULT_INPUT_LOCK_MS = 1200;
/** How long the player must stop tapping the card before its buttons wake (each locked tap restarts it). */
export const RESULT_QUIET_MS = 1500;

/**
 * When the buttons wake up after a tap at `now`, given the current wake time. A tap after the lock has
 * run out is a real press (the wake time stays); a tap during the lock pushes the wake time to now + quietMs.
 */
export function nextMashUnlock(unlockAt: number, now: number, quietMs: number = RESULT_QUIET_MS): number {
  if (!Number.isFinite(unlockAt) || now >= unlockAt) return unlockAt;
  return Math.max(unlockAt, now + Math.max(0, quietMs));
}

/**
 * Replays a tapper against the lock (tests and tuning): taps at `taps` ms after the card appeared.
 * Returns the time of the first tap that would press a button, or null when every tap was absorbed.
 */
export function firstPressOf(taps: readonly number[], firstMs: number = RESULT_INPUT_LOCK_MS, quietMs: number = RESULT_QUIET_MS): number | null {
  let unlockAt = firstMs;
  for (const at of taps) {
    if (at >= unlockAt) return at;
    unlockAt = nextMashUnlock(unlockAt, at, quietMs);
  }
  return null;
}
