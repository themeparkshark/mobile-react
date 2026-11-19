/**
 * Beat the Buzzer / Trivia Duel: what a tile tap does, decided on the UI thread from the question clock
 * (fix round w4, T051). The clock, not the tile's drawn state, is the authority: a tile is touchable from
 * the moment the question shows (striped or face up), so a tap is never dropped without a sign.
 *   early: the tiles are not open yet (read lock, the first moment after it, or a bell round before the
 *          bell): the tile wiggles, nothing is spent, the next tap counts.
 *   lock:  the answer locks (scored at `my`, ms since the tiles opened).
 *   sub:   a bell round's answer after the buzz.
 *   none:  the question is over or the tile is gone.
 */
export type TileTapOutcome = 'early' | 'lock' | 'sub' | 'none';

export const TAP_PH = { idle: 0, read: 1, live: 2, locked: 3, sub: 5, wait: 8 } as const;
export const TAP_KIND_BELL = 2;

export function tileTapOutcome(phase: number, kind: number, my: number, removed: boolean, guardMs: number): TileTapOutcome {
  'worklet';
  if (phase === TAP_PH.read) return 'early';
  if (removed) return 'none';
  if (phase === TAP_PH.live) {
    // A bell round's tiles open with the buzz: a tap before it says "not yet" instead of nothing.
    if (kind === TAP_KIND_BELL) return 'early';
    return my < guardMs ? 'early' : 'lock';
  }
  if (phase === TAP_PH.sub) return 'sub';
  return 'none';
}
