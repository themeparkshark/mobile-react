/**
 * The park day's counts in words, from the server (fix pass w4, T198). The phone only sees wins on its own map,
 * so a win in LinePlay or after a relaunch was missing from "3 coins won today" while the server had 4. Core-loop
 * servers send coins_won (every won attempt), waits (every wait today, a running one too) and rides_ridden (every
 * ride logged at this park today); an older server leaves them out, and the old counts stay.
 * Pure, unit tested in tools/tests/fix-w4-home.test.cjs.
 */
export interface RecapCountsLike {
  readonly distinct_rides_won: number;
  readonly line_play_sessions: number;
  readonly eligible_line_minutes: number;
  readonly ride_parts_earned: number;
  readonly coins_won?: number;
  readonly waits?: number;
  readonly rides_ridden?: number;
}

const whole = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Coins won today by the server's count, or null when this server does not say (then the phone's count stands). */
export function serverCoinsWon(recap: Pick<RecapCountsLike, 'coins_won'> | null | undefined): number | null {
  return whole(recap?.coins_won);
}

/** The goodbye card's number: the server's count once it answered, else what this phone saw. */
export function goodbyeCoins(phoneCount: number, recap: Pick<RecapCountsLike, 'coins_won'> | null | undefined): number {
  return serverCoinsWon(recap) ?? Math.max(0, Math.floor(Number(phoneCount) || 0));
}

/** The story's WINS tile: every coin won today (a ride won twice counts twice), else distinct rides won. */
export function recapWins(recap: RecapCountsLike): number {
  return serverCoinsWon(recap) ?? Math.max(0, recap.distinct_rides_won);
}

/** "2 waits · 4 minutes in line · 1 Ride Part", or null with no wait today. */
export function recapLineCopy(recap: RecapCountsLike): string | null {
  const waits = whole(recap.waits);
  const count = waits ?? recap.line_play_sessions;
  if (!(count > 0)) return null;
  const minutes = Math.max(0, recap.eligible_line_minutes);
  const parts = Math.max(0, recap.ride_parts_earned);
  return [waits != null ? plural(waits, 'wait', 'waits') : null, plural(minutes, 'minute in line', 'minutes in line'),
    plural(parts, 'Ride Part', 'Ride Parts')].filter(Boolean).join(' · ');
}

/** "3 rides ridden", or null when no ride was logged (or the server does not count them). */
export function recapRidesCopy(recap: Pick<RecapCountsLike, 'rides_ridden'>): string | null {
  const n = whole(recap.rides_ridden);
  return n ? plural(n, 'ride ridden', 'rides ridden') : null;
}
