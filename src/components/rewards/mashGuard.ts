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
 * Fix pass w4 N03: how much longer the buttons must wait after the last touch anywhere on screen (0 = wake now).
 * A touch on the board around the card counts like a touch on the buttons: the player is still tapping.
 */
export function quietWaitLeft(lastTouchAt: number, now: number, quietMs: number = RESULT_QUIET_MS): number {
  if (!(lastTouchAt > 0)) return 0;
  return Math.max(0, lastTouchAt + quietMs - now);
}

/**
 * Replays a tapper whose taps land anywhere (board, card or buttons) against the lock: the first tap that
 * lands on a button after the buttons woke, or null. `onButton(i)` says whether tap i hit a button.
 */
export function firstButtonPressOf(taps: readonly number[], onButton: (i: number) => boolean,
  firstMs: number = RESULT_INPUT_LOCK_MS, quietMs: number = RESULT_QUIET_MS): number | null {
  let wakeAt = firstMs;
  let last = 0;
  for (let i = 0; i < taps.length; i += 1) {
    const at = taps[i];
    // The wake timer fires at wakeAt; it waits on while a touch landed less than quietMs before it.
    while (wakeAt <= at && quietWaitLeft(last, wakeAt, quietMs) > 0) wakeAt = last + quietMs;
    if (at >= wakeAt && onButton(i)) return at;
    last = at;
  }
  return null;
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
