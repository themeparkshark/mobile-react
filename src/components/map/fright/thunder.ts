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
 * The flash itself (UI thread): two quick soft pulses and a tail, peak 0.16
 * opacity. Never a strobe: one flash per strike, well under 3 per second.
 */
export function flashLevel(ageS: number, strength: number): number {
  'worklet';
  if (ageS < 0 || ageS > 0.9) return 0;
  const pulse = (t: number, at: number, width: number) => {
    const x = (t - at) / width;
    return x < 0 || x > 1 ? 0 : Math.sin(x * Math.PI);
  };
  const v = Math.max(pulse(ageS, 0, 0.12), 0.6 * pulse(ageS, 0.2, 0.1), 0.25 * pulse(ageS, 0.3, 0.6));
  return 0.16 * strength * v;
}
