/**
 * Honest, warm words for a Memory Match run that ran out of time.
 *
 * "SO CLOSE" is only true when the player really was close. A kid who found
 * no pairs hears that time ran out and gets one tip; a kid halfway there
 * hears how far they got. Never a scold, never a fib.
 */
export interface LossCopy {
  /** Big title on the end card (Shark lettering, upper case). */
  readonly title: string;
  /** One short line under it. */
  readonly line: string;
}

export function memoryLossCopy(pairs: number, total: number, outOfTurns = false): LossCopy {
  const p = Math.max(0, Math.floor(pairs));
  const t = Math.max(1, Math.floor(total));
  const left = Math.max(0, t - p);
  // Low-signal rides end on a turn limit, not the clock.
  if (p === 0) return outOfTurns
    ? { title: 'OUT OF FLIPS!', line: 'Flip 2 cards. Remember where they were.' }
    : { title: "TIME'S UP!", line: 'Flip 2 cards. Remember where they were.' };
  if (outOfTurns && left > 2) return { title: 'OUT OF FLIPS!', line: `You found ${p} of ${t} pairs. Keep going!` };
  if (left <= 2) return { title: 'SO CLOSE!', line: left === 1 ? 'Just 1 pair to go!' : `Just ${left} pairs to go!` };
  if (p * 2 >= t) return { title: 'NICE TRY!', line: `You found ${p} of ${t} pairs.` };
  return { title: 'GOOD START!', line: `You found ${p} of ${t} pairs. Keep going!` };
}

/** The results banner for a lost run (no numbers jammed into the title). */
export function memoryLossBanner(pairs: number, total: number, outOfTurns = false): string {
  return memoryLossCopy(pairs, total, outOfTurns).title;
}

/** The line under TRY AGAIN: how many tries this Ticket still has. */
export function triesLeftLine(left: number): string {
  if (left <= 0) return 'That was the last try on this Ticket.';
  return `${left} more ${left === 1 ? 'try' : 'tries'} on this Ticket`;
}
