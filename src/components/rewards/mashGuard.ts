/**
 * The input lock on every result and try card (fix round W3, T046). A card's
 * buttons sit where the game's targets were a moment ago, so a kid still
 * mashing the holes would press TRY AGAIN or BACK TO MAP without ever seeing
 * the card. Each button waits RESULT_INPUT_LOCK_MS after the card appears,
 * and a tap that lands while it is locked starts that wait again: only a
 * finger that has stopped mashing can press a button. Pure, no React.
 */

/** How long a result card's buttons ignore taps after it appears (and after each locked tap). */
export const RESULT_INPUT_LOCK_MS = 600;

/**
 * When the buttons wake up after a tap at `now`, given the current wake time. A tap after the lock has
 * run out is a real press (the wake time stays); a tap during the lock pushes the wake time to now + lockMs.
 */
export function nextMashUnlock(unlockAt: number, now: number, lockMs: number = RESULT_INPUT_LOCK_MS): number {
  if (!Number.isFinite(unlockAt) || now >= unlockAt) return unlockAt;
  return Math.max(unlockAt, now + Math.max(0, lockMs));
}
