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
 *  - otherwise the full bell and sparkle (catch.burst).
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

export interface CatchRunState {
  /** Local day of the last catch (YYYY-MM-DD), or null before the first. */
  readonly dayKey: string | null;
  readonly lastCatchAt: number;
  /** Catches this session. */
  readonly count: number;
}

export const EMPTY_RUN: CatchRunState = { dayKey: null, lastCatchAt: -Infinity, count: 0 };

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
  const next: CatchRunState = { dayKey: day, lastCatchAt: now, count };
  if (state.dayKey !== day) return { moment: 'catch.firstOfDay', state: next };
  if (count % LUCKY_EVERY === 0) return { moment: 'catch.lucky', state: next };
  if (now - state.lastCatchAt <= REPEAT_WINDOW_MS) return { moment: 'catch.repeat', state: next };
  return { moment: 'catch.burst', state: next };
}
