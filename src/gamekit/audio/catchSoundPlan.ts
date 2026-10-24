/**
 * catchSoundPlan.ts: which sound each catch gets, so the 100th still feels good
 * (wow-sound lane, Oct 24 2026). Pure rules, unit tested in
 * tools/tests/wow-sound-trace.test.cjs; catchAudio.ts keeps the state.
 *
 *  - the first coin of the day: the big golden chord (catch.firstOfDay);
 *  - a catch within REPEAT_WINDOW_MS of the last one: the short sparkle
 *    (catch.repeat), so a run of catches stays quick;
 *  - every LUCKY_EVERY-th catch of a session: a little coin shower
 *    (catch.lucky), a small surprise that is the same for everyone (no random
 *    odds, no prize attached: only the sound changes);
 *  - the 25th, 50th and 100th coin of the day: a rarer powered-up shower
 *    (catch.milestone), no longer than the full bell;
 *  - otherwise the full bell and sparkle (catch.burst).
 *
 * A quick run also gets hotter: every catch inside REPEAT_WINDOW_MS of the
 * last one lifts the wobble ticks and the counter ticks one rung of the
 * 13-step coin ladder (catchHeat), up to HEAT_MAX, so the 10th quick catch
 * sounds brighter than the 1st without getting any longer. A pause resets it.
 */

import type { MomentName } from './momentMap';

/** A catch this soon after the last one is part of a run (ms). */
export const REPEAT_WINDOW_MS = 120_000;
/** Every Nth catch of a session gets the lucky shower. */
export const LUCKY_EVERY = 12;
/**
 * The wobble ticks under the gather (ms after the tap): the same beats as the
 * rising wobble haptics in the map catch (mapWow.catchHaptics: 200, 350, 480).
 */
export const CATCH_WOBBLE_TICKS_MS: readonly number[] = [200, 350, 480];

/** Coins of the day that ring the rarer milestone shower. */
export const DAY_MILESTONES: readonly number[] = [25, 50, 100];
/** Most rungs a quick run lifts the ladder: wobble ticks top out at rung 9 (HEAT_MAX + 2). */
export const HEAT_MAX = 7;

export interface CatchRunState {
  /** Local day of the last catch (YYYY-MM-DD), or null before the first. */
  readonly dayKey: string | null;
  readonly lastCatchAt: number;
  /** Catches this session. */
  readonly count: number;
  /** Catches today (on this phone), for the 25th / 50th / 100th milestone. */
  readonly dayCount: number;
  /** Catches in the current quick run (each within REPEAT_WINDOW_MS of the last). */
  readonly streak: number;
}

export const EMPTY_RUN: CatchRunState = { dayKey: null, lastCatchAt: -Infinity, count: 0, dayCount: 0, streak: 0 };

/**
 * How many rungs this catch's ticks climb (0 for the first catch of a run).
 * Known at the tap, before the burst, so the wobble ticks can use it.
 */
export function catchHeat(state: CatchRunState, now: number): number {
  if (now - state.lastCatchAt > REPEAT_WINDOW_MS) return 0;
  return Math.min(HEAT_MAX, Math.max(0, state.streak));
}

/** Stored as "YYYY-MM-DD|count" so the milestone count survives an app restart the same day. */
export function encodeDay(state: CatchRunState): string | null {
  return state.dayKey ? `${state.dayKey}|${state.dayCount}` : null;
}

export function decodeDay(raw: string | null | undefined): { dayKey: string; dayCount: number } | null {
  if (!raw) return null;
  const [day, n] = raw.split('|');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const count = Number(n);
  return { dayKey: day, dayCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1 };
}

/** Local calendar day, so "first of the day" follows the player's own clock. */
export function localDayKey(now: number): string {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** The burst for this catch, and the state after it. */
export function burstMoment(state: CatchRunState, now: number): { moment: MomentName; state: CatchRunState } {
  const day = localDayKey(now);
  const count = state.count + 1;
  const newDay = state.dayKey !== day;
  const dayCount = newDay ? 1 : state.dayCount + 1;
  const quick = now - state.lastCatchAt <= REPEAT_WINDOW_MS;
  const next: CatchRunState = { dayKey: day, lastCatchAt: now, count, dayCount, streak: quick ? state.streak + 1 : 1 };
  if (newDay) return { moment: 'catch.firstOfDay', state: next };
  if (DAY_MILESTONES.includes(dayCount)) return { moment: 'catch.milestone', state: next };
  if (count % LUCKY_EVERY === 0) return { moment: 'catch.lucky', state: next };
  if (now - state.lastCatchAt <= REPEAT_WINDOW_MS) return { moment: 'catch.repeat', state: next };
  return { moment: 'catch.burst', state: next };
}
