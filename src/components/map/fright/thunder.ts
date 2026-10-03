/**
 * Lightning and thunder timing for the fright sky. Pure and seeded, unit tested.
 *
 * - Never in the first 20 s after the layer starts (let the fog settle).
 * - At most one strike per 90 s; the real gap is randomized (90 to 240 s).
 * - Thunder lands 0.6 to 1.8 s after the flash, like a distant storm.
 * - While `quiet` (phones-down in a haunt, a live night show) nothing strikes:
 *   the strike is put off by 15 to 45 s and tried again.
 */
import { randAt } from './random';

export const THUNDER_FIRST_QUIET_MS = 20_000;
export const THUNDER_MIN_GAP_MS = 90_000;
export const THUNDER_EXTRA_GAP_MS = 150_000;
export const THUNDER_DELAY_MIN_MS = 600;
export const THUNDER_DELAY_MAX_MS = 1800;
const DEFER_MIN_MS = 15_000;
const DEFER_EXTRA_MS = 30_000;

export interface ThunderState {
  readonly seed: number;
  readonly startedAt: number;
  readonly lastStrikeAt: number | null;
  readonly nextAt: number;
  /** Draws taken from the seed so far (each decision uses a new one). */
  readonly n: number;
}

export interface Strike {
  readonly at: number;
  /** Thunder sound and haptic after the flash. */
  readonly thunderDelayMs: number;
  /** 0..1 flash strength, varied a little per strike. */
  readonly strength: number;
}

export function startThunder(now: number, seed: number): ThunderState {
  // First strike somewhere between 25 s and 2 minutes in.
  const first = THUNDER_FIRST_QUIET_MS + 5_000 + randAt(seed, 0) * 95_000;
  return { seed, startedAt: now, lastStrikeAt: null, nextAt: now + first, n: 1 };
}

/** Advance to `now`. Returns the new state and a strike when one fires right now. */
export function stepThunder(state: ThunderState, now: number, quiet: boolean): { state: ThunderState; strike: Strike | null } {
  if (now < state.nextAt) return { state, strike: null };
  const tooEarly = now - state.startedAt < THUNDER_FIRST_QUIET_MS;
  const tooSoon = state.lastStrikeAt !== null && now - state.lastStrikeAt < THUNDER_MIN_GAP_MS;
  if (quiet || tooEarly || tooSoon) {
    const wait = DEFER_MIN_MS + randAt(state.seed, state.n) * DEFER_EXTRA_MS;
    const floor = Math.max(
      state.startedAt + THUNDER_FIRST_QUIET_MS,
      state.lastStrikeAt === null ? 0 : state.lastStrikeAt + THUNDER_MIN_GAP_MS,
    );
    return { state: { ...state, nextAt: Math.max(now + wait, floor), n: state.n + 1 }, strike: null };
  }
  const delay = THUNDER_DELAY_MIN_MS + randAt(state.seed, state.n) * (THUNDER_DELAY_MAX_MS - THUNDER_DELAY_MIN_MS);
  const strength = 0.7 + randAt(state.seed, state.n + 1) * 0.3;
  const gap = THUNDER_MIN_GAP_MS + randAt(state.seed, state.n + 2) * THUNDER_EXTRA_GAP_MS;
  return {
    state: { ...state, lastStrikeAt: now, nextAt: now + gap, n: state.n + 3 },
    strike: { at: now, thunderDelayMs: Math.round(delay), strength: Math.round(strength * 100) / 100 },
  };
}

/**
 * The screen flash (UI thread), MAP_FX_SPEC: up to 0.35 in 60 ms, back to
 * 0.05 by 180 ms, a second blip to 0.22 for 60 ms, then out over 200 ms.
 * Lite peaks at 0.2 with no second blip. One flash per strike, so well under
 * 3 flashes a second.
 */
export function flashLevel(ageS: number, strength: number, lite = false): number {
  'worklet';
  const ms = ageS * 1000;
  if (ms < 0 || ms > 440) return 0;
  const peak = lite ? 0.2 : 0.35;
  let v = 0;
  if (ms < 60) v = peak * (ms / 60);
  else if (ms < 180) v = peak + (0.05 - peak) * ((ms - 60) / 120);
  else if (ms < 240) v = lite ? 0.05 : 0.22;
  else v = (lite ? 0.05 : 0.22) * (1 - (ms - 240) / 200);
  return Math.max(0, v * strength);
}
