/**
 * catchSoundPlan.ts: which sound each catch gets, so the 100th still feels good
 * (wow-sound lane, Oct 24 2026). Pure rules, unit tested in
 * tools/tests/wow-sound-trace.test.cjs; catchAudio.ts keeps the state.
 *
 *  - the first coin of the day: the big golden chord (catch.firstOfDay);
 *  - a catch within REPEAT_WINDOW_MS of the last one: the short sparkle
 *    (catch.repeat), so a run of catches stays quick;
 *  - every Nth coin of the day, N between 10 and 14 picked by the date
 *    (luckyEvery): a little coin shower (catch.lucky). The same for everyone
 *    on a given day and never random odds, no prize attached: only the sound
 *    changes, and because N moves day to day it never settles into a beat the
 *    ear can count;
 *  - the 25th, 50th and 100th coin of the day: a rarer powered-up shower
 *    (catch.milestone), no longer than the full bell;
 *  - otherwise the full bell and sparkle (catch.burst).
 *
 * A quick run also gets hotter: every catch inside REPEAT_WINDOW_MS of the
 * last one lifts the wobble ticks and the counter ticks one rung of the
 * 13-step coin ladder (catchHeat), up to HEAT_MAX, so the 10th quick catch
 * sounds brighter than the 1st without getting any longer. A pause resets it.
 * Heat climbs more than pitch (heatTier): from tier 1 the wobble buzzes get
 * one rung heavier, from tier 2 two rungs and the burst lands a second thump,
 * and from HOT_LAYER_HEAT a bright glockenspiel rides on the burst. wow-map can
 * read the same number (currentCatchHeat in catchAudio.ts) to grow its rays.
 */

import type { MomentName } from './momentMap';

/** A catch this soon after the last one is part of a run (ms). */
export const REPEAT_WINDOW_MS = 120_000;
/** The lucky shower lands on every Nth coin of the day, N in this range (picked by the date). */
export const LUCKY_RANGE: readonly [number, number] = [10, 14];
/** Heat at which the bright burst layer (catch.hot) joins the burst. */
export const HOT_LAYER_HEAT = 5;
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

/**
 * How strong this catch's buzz is: 0 for a calm catch (heat 0 or 1), 1 from heat 2,
 * 2 from heat 4 (the wobble buzzes climb, the burst gets its second thump).
 */
export function heatTier(heat: number): 0 | 1 | 2 {
  return heat >= 4 ? 2 : heat >= 2 ? 1 : 0;
}

/**
 * Today's lucky number: every Nth coin of the day gets the shower. A small hash of the date picks
 * N inside LUCKY_RANGE, so it moves from day to day but is the same for every player on that day
 * and never depends on chance (a parent can see there are no odds behind it).
 */
export function luckyEvery(dayKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < dayKey.length; i++) { h ^= dayKey.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const [lo, hi] = LUCKY_RANGE;
  return lo + (h % (hi - lo + 1));
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
  if (dayCount % luckyEvery(day) === 0) return { moment: 'catch.lucky', state: next };
  if (now - state.lastCatchAt <= REPEAT_WINDOW_MS) return { moment: 'catch.repeat', state: next };
  return { moment: 'catch.burst', state: next };
}
