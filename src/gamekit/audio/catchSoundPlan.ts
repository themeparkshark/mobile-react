/**
 * catchSoundPlan.ts: which sound each catch gets, so the 100th still feels good
 * (wow-sound lane, Oct 24 2026). Pure rules, unit tested in
 * tools/tests/wow-sound-trace.test.cjs and wow-sound-r5.test.cjs; catchAudio.ts
 * keeps the state.
 *
 * Round 5: every surprise you hear is one you can see. The sound follows the map
 * catch's own picture (wow-map round 4, mapWow.catchPlan and burstVariant):
 *  - the full show (the first catch of a session, 'tap'): the full bell
 *    (catch.burst), or the big golden chord when it is also the first coin of
 *    the day (catch.firstOfDay);
 *  - the short show (every later catch, 'tap-repeat'): the short sparkle
 *    (catch.repeat), so a run of catches stays quick;
 *  - every 10th catch a gold beam drops onto the find (wow-map's 'beam' mark):
 *    the beam lands with its own slam (catch.lucky) on the held frame;
 *  - every 25th catch is the grand burst (the beam plus the biggest ink): the
 *    burst rings the rare powered-up shower (catch.milestone).
 * No sound-only prizes: round 4's daily lucky count and the 25th / 50th / 100th
 * coin of the day rang with nothing new on screen, so they are gone.
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
/** Heat at which the bright burst layer (catch.hot) joins the burst. */
export const HOT_LAYER_HEAT = 5;
/**
 * The wobble beats under the gather (ms on the catch clock): the same beats as the
 * rising wobble haptics in the map catch (mapWow.catchHaptics). The full show has
 * three (200, 350, 480), a later catch's short show two (150, 290).
 */
export const CATCH_WOBBLE_TICKS_MS: readonly number[] = [200, 350, 480];
export const REPEAT_WOBBLE_TICKS_MS: readonly number[] = [150, 290];
/** The buzz on each wobble beat (mapWow.catchHaptics): light, then a little heavier. */
export const CATCH_WOBBLE_INTENTS: readonly ('tickSelection' | 'tapLight' | 'hitMedium')[] = ['tickSelection', 'tapLight', 'hitMedium'];
export const REPEAT_WOBBLE_INTENTS: readonly ('tickSelection' | 'tapLight' | 'hitMedium')[] = ['tickSelection', 'hitMedium'];
/** Two catch buzzes never land closer than this (a flam): a bunched beat waits, a press echo is dropped. */
export const MIN_BEAT_GAP_MS = 90;
/** Coin ticks into the counter never land closer than this on the audio clock. */
export const COIN_TICK_GAP_MS = 70;
/** wow-map burstVariant: every 25th catch of a session is the grand burst (the beam and the biggest ink). */
export const GRAND_EVERY = 25;
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

/** What the map is showing for this catch (wow-map's marks): the short show, and whether the gold beam dropped. */
export interface CatchVisual {
  /** A later catch this session ('tap-repeat'): the short show. */
  readonly repeatPlan?: boolean;
  /** The gold beam dropped on this catch (wow-map's 'beam' mark: every 10th catch). */
  readonly beam?: boolean;
}

/**
 * The burst for this catch, and the state after it. The sound follows the picture: the short show
 * gets the short sparkle, the grand burst (a beam on the 25th catch) the rare shower, and the golden
 * chord only on a full show (never squeezed into a short one).
 */
export function burstMoment(state: CatchRunState, now: number, visual: CatchVisual = {}): { moment: MomentName; state: CatchRunState } {
  const day = localDayKey(now);
  const count = state.count + 1;
  const newDay = state.dayKey !== day;
  const dayCount = newDay ? 1 : state.dayCount + 1;
  const quick = now - state.lastCatchAt <= REPEAT_WINDOW_MS;
  const next: CatchRunState = { dayKey: day, lastCatchAt: now, count, dayCount, streak: quick ? state.streak + 1 : 1 };
  if (visual.beam && count % GRAND_EVERY === 0) return { moment: 'catch.milestone', state: next };
  if (visual.repeatPlan) return { moment: 'catch.repeat', state: next };
  if (newDay) return { moment: 'catch.firstOfDay', state: next };
  return { moment: 'catch.burst', state: next };
}
