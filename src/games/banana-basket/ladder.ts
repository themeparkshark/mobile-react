/** Banana note ladder (pure): see audio.ts. */

/**
 * The note ladder: climbs per chain catch, resolves on the tonic (7) at a
 * tier-up, wraps inside the upper octave, resets on a break. Golden Hour
 * plays it an octave up.
 */
export interface Ladder {
  i: number;
}

export function ladderNext(l: Ladder, tierUp: boolean): number {
  if (tierUp) l.i = 7;
  else l.i = l.i >= 15 ? 8 : l.i + 1;
  return l.i;
}

export function ladderNote(l: Ladder, golden: boolean): number {
  return golden ? Math.min(15, l.i + 7) : l.i;
}

export function ladderReset(l: Ladder): void {
  l.i = -1;
}
