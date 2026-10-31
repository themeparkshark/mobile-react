/**
 * Honest, warm words for a Memory Match run that ran out of time.
 *
 * "SO CLOSE" is only true when the player really was close. The line under it
 * says what the kid did ("3 of 8 pairs!"); only a kid who never flipped a card
 * gets the one move. Never a scold, never a fib.
 */
export interface LossCopy {
  /** Big title on the end card (Shark lettering, upper case). */
  readonly title: string;
  /** One short line under it. */
  readonly line: string;
}

export function memoryLossCopy(pairs: number, total: number, outOfTurns = false, flipped = true): LossCopy {
  const p = Math.max(0, Math.floor(pairs));
  const t = Math.max(1, Math.floor(total));
  const left = Math.max(0, t - p);
  // Low-signal rides end on a turn limit, not the clock.
  // Never flipped a card: teach the one move, don't ask them to remember.
  // The line says what the kid did ("3 of 8 pairs!"), never the how-to again. Only a kid
  // who never flipped a card hears the one move.
  const did = `${p} of ${t} pairs!`;
  if (p === 0) return { title: outOfTurns ? 'OUT OF FLIPS!' : "TIME'S UP!", line: flipped ? `${did} Try again!` : 'Tap 2 cards to flip them!' };
  if (outOfTurns && left > 2) return { title: 'OUT OF FLIPS!', line: did };
  if (left <= 2) return { title: 'SO CLOSE!', line: `${did} Just ${left} to go!` };
  if (p * 2 >= t) return { title: 'NICE TRY!', line: did };
  return { title: 'GOOD START!', line: did };
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
