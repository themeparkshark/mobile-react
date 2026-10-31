/**
 * Park day events for the unlock ladder and the shelf's park day story card (core loop blueprint
 * 4.4 "Who records what", October 2026). guide-map records:
 * - park_day_started: the first fresh in-park reading of a park-local day;
 * - park_day_done: leaving the park after a day with 1 or more coins (a trusted reading 2 km
 *   outside, or the next home-mode open);
 * - home_day: the first home-mode open of a local day.
 * The day done signal is published here for the shelf's park day story card (shelf-words imports
 * parkDaySignal and never edits this file).
 *
 * parkDayStep is pure (node tests); the map calls it on every location and mode change.
 * Owned by the guide-map lane.
 */
import { guideMeters, type GuidePoint } from './nextCoin';

/** A reading this far from the last in-park reading counts as having left the park. */
export const LEFT_PARK_METERS = 2000;
/**
 * A far reading is trusted when its accuracy is this good (m) or better. A reading with worse or
 * unknown accuracy needs a second far reading in a row, so one GPS jump never ends a park day.
 */
export const TRUSTED_ACCURACY_METERS = 100;

export interface ParkDayRecord {
  /** The park-local day (YYYY-MM-DD) of the open park day, or null. */
  readonly day: string | null;
  readonly parkId: number | null;
  /** Coins won at the park today (counted on this phone). */
  readonly coins: number;
  /** The last trusted in-park reading. */
  readonly lastInPark: GuidePoint | null;
  /** This park day already counted as done. */
  readonly done: boolean;
  /** The last local day a home-mode open was counted. */
  readonly homeDay: string | null;
  /** Far readings in a row that were not yet trusted (one GPS jump never ends the day). */
  readonly farStreak?: number;
}

export const EMPTY_PARK_DAY: ParkDayRecord = Object.freeze({ day: null, parkId: null, coins: 0, lastInPark: null, done: false, homeDay: null, farStreak: 0 });

export type ParkDayEvent =
  | { readonly kind: 'park_day_started'; readonly parkId: number }
  | { readonly kind: 'park_day_done'; readonly parkId: number; readonly coins: number; readonly day: string }
  | { readonly kind: 'home_day' };

export interface ParkDayInput {
  readonly mode: 'park' | 'home' | 'unknown';
  readonly parkId: number | null;
  readonly location: GuidePoint | null;
  /** The phone-local day now (YYYY-MM-DD). */
  readonly today: string;
  /** Coins won since the last step (a win on this map). */
  readonly coinsWon?: number;
  /** The reading's horizontal accuracy in meters, or null when unknown. */
  readonly accuracy?: number | null;
}

/** A far reading counts: good accuracy, or the second far reading in a row. Pure. */
export function farReadingTrusted(accuracy: number | null | undefined, farStreak: number | undefined): boolean {
  const good = typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy > 0 && accuracy <= TRUSTED_ACCURACY_METERS;
  return good || (farStreak ?? 0) >= 1;
}

/** One step: what to record and the record to keep. Pure. */
export function parkDayStep(prev: ParkDayRecord, input: ParkDayInput): { next: ParkDayRecord; events: ParkDayEvent[] } {
  const events: ParkDayEvent[] = [];
  let next: ParkDayRecord = { ...EMPTY_PARK_DAY, ...prev };
  const won = Number.isFinite(input.coinsWon) && (input.coinsWon ?? 0) > 0 ? Math.floor(input.coinsWon!) : 0;

  // A park day from an earlier date that never closed: it ends now (with its coins, if any).
  const closeOpenDay = () => {
    if (next.day && next.parkId != null && !next.done && next.coins > 0) {
      events.push({ kind: 'park_day_done', parkId: next.parkId, coins: next.coins, day: next.day });
    }
  };

  if (input.mode === 'park' && input.parkId != null && input.location) {
    // Park mode can linger after the player left (the place check keeps the last park): a reading 2 km
    // from today's last real in-park reading is a trusted "left the park", never a new in-park reading.
    const far = next.day === input.today && next.parkId === input.parkId && !!next.lastInPark &&
      guideMeters(input.location, next.lastInPark) >= LEFT_PARK_METERS;
    if (far) {
      next = { ...next, coins: next.coins + won };
      // One far reading with poor accuracy may be a GPS jump: wait for a second one (it is never in-park either).
      if (!farReadingTrusted(input.accuracy, prev.farStreak)) {
        next = { ...next, farStreak: (prev.farStreak ?? 0) + 1 };
        return { next, events };
      }
      next = { ...next, farStreak: 0 };
      if (!next.done && next.coins > 0) {
        events.push({ kind: 'park_day_done', parkId: input.parkId, coins: next.coins, day: input.today });
        next = { ...next, done: true };
      }
      return { next, events };
    }
    if (next.day !== input.today || next.parkId !== input.parkId) {
      if (next.day !== input.today) closeOpenDay();
      if (next.day !== input.today) events.push({ kind: 'park_day_started', parkId: input.parkId });
      next = { ...next, day: input.today, parkId: input.parkId, coins: next.day === input.today ? next.coins : 0, done: false };
    }
    next = { ...next, lastInPark: input.location, coins: next.coins + won, farStreak: 0 };
    return { next, events };
  }

  if (won > 0 && next.day === input.today) next = { ...next, coins: next.coins + won };

  if (input.mode === 'home') {
    if (next.homeDay !== input.today) {
      events.push({ kind: 'home_day' });
      next = { ...next, homeDay: input.today };
    }
    // The next home-mode open closes a park day that had a coin.
    if (next.day && next.parkId != null && !next.done && next.coins > 0) {
      events.push({ kind: 'park_day_done', parkId: next.parkId, coins: next.coins, day: next.day });
      next = { ...next, done: true };
    }
    return { next, events };
  }

  // Outside any park, not yet confirmed home: a trusted reading 2 km from the last in-park reading.
  if (input.location && next.lastInPark && next.day && next.parkId != null && !next.done && next.coins > 0 &&
    guideMeters(input.location, next.lastInPark) >= LEFT_PARK_METERS) {
    if (!farReadingTrusted(input.accuracy, prev.farStreak)) return { next: { ...next, farStreak: (prev.farStreak ?? 0) + 1 }, events };
    events.push({ kind: 'park_day_done', parkId: next.parkId, coins: next.coins, day: next.day });
    next = { ...next, done: true, farStreak: 0 };
  } else if ((next.farStreak ?? 0) > 0) next = { ...next, farStreak: 0 };
  return { next, events };
}

// ---------------------------------------------------------------------------
// The park day done signal (for the shelf's park day story card).

export interface ParkDayDone { readonly parkId: number; readonly day: string; readonly coins: number; readonly at: number }

let lastDone: ParkDayDone | null = null;
const listeners = new Set<() => void>();

export const parkDaySignal = {
  /** The most recent park day that ended with 1 or more coins (this app run), or null. */
  last(): ParkDayDone | null { return lastDone; },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** The map only. */
  publish(done: ParkDayDone): void {
    lastDone = done;
    listeners.forEach(listener => { try { listener(); } catch { /* keep going */ } });
  },
  /** Tests only. */
  reset(): void { lastDone = null; },
};
