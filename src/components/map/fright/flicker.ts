/**
 * Haunt lantern window flicker. Pure, unit tested; levels are evaluated on the
 * UI thread from flat number arrays built once per lantern.
 *
 * Profiles (fx.flicker):
 *  - candle: a warm wobble with soft dips.
 *  - neon: steady, with a rare buzz-off of a fraction of a second.
 *  - strobe-soft: slow breathing blinks. Photosafe: never faster than 2 Hz.
 * Unknown profiles fall back to candle. Every window gets its own randomized
 * speed, phase and dip timing from the seed, so no two windows sync up.
 */
import { randAt } from './random';

export type FlickerProfile = 'candle' | 'neon' | 'strobe-soft';

export function flickerProfile(value: string | null | undefined): FlickerProfile {
  return value === 'neon' || value === 'strobe-soft' ? value : 'candle';
}

/** Max on/off cycles per second any profile may produce (photosensitivity). */
export const MAX_FLICKER_HZ = 2;

/** Numbers per window in a plan. */
export const PLAN_STRIDE = 7;

/**
 * A flat plan for `windows` windows: [kind, base, amp, hz, phase, dipEvery, dipLen] each.
 * kind: 0 candle, 1 neon, 2 strobe-soft.
 */
export function flickerPlan(profile: FlickerProfile, seed: number, windows: number): number[] {
  const plan: number[] = [];
  const kind = profile === 'neon' ? 1 : profile === 'strobe-soft' ? 2 : 0;
  for (let i = 0; i < Math.max(0, Math.floor(windows)); i++) {
    const r = (k: number) => randAt(seed, i * 11 + k);
    if (kind === 0) {
      plan.push(0, 0.72 + r(1) * 0.12, 0.12 + r(2) * 0.08, 0.6 + r(3) * 0.9, r(4) * 6.283, 4 + r(5) * 7, 0.18 + r(6) * 0.25);
    } else if (kind === 1) {
      plan.push(1, 0.9, 0.04, 0.3 + r(3) * 0.4, r(4) * 6.283, 7 + r(5) * 12, 0.08 + r(6) * 0.22);
    } else {
      plan.push(2, 0.55, 0.4, 0.25 + r(3) * (MAX_FLICKER_HZ - 1.4), r(4) * 6.283, 9 + r(5) * 9, 0.4 + r(6) * 0.4);
    }
  }
  return plan;
}

/** A window's light 0.12..1 at ambient time t (seconds). */
export function windowLevel(plan: readonly number[], i: number, t: number): number {
  'worklet';
  const o = i * PLAN_STRIDE;
  if (o + PLAN_STRIDE > plan.length) return 0.85;
  const kind = plan[o];
  const base = plan[o + 1];
  const amp = plan[o + 2];
  const hz = plan[o + 3];
  const phase = plan[o + 4];
  const every = plan[o + 5];
  const len = plan[o + 6];
  const w = t * hz * 6.283 + phase;
  let v = base;
  if (kind === 0) v = base + amp * (0.6 * Math.sin(w) + 0.4 * Math.sin(w * 2.7 + 1.3));
  else if (kind === 1) v = base + amp * Math.sin(w);
  else v = base + amp * Math.sin(w);
  // A dip (candle gutters, neon buzzes off, strobe-soft rests) once per `every` seconds.
  const inCycle = (t + phase * 3) % every;
  if (inCycle < len) v = kind === 1 ? 0.2 : v * (kind === 0 ? 0.55 : 0.35);
  return Math.max(0.12, Math.min(1, v));
}

/** Seconds between passing silhouettes in a lantern, and how long one takes to cross. */
export const SILHOUETTE_EVERY_MIN_S = 24;
export const SILHOUETTE_EVERY_MAX_S = 48;
export const SILHOUETTE_CROSS_S = 2.4;

/** [every, offset, window] for one lantern's silhouettes. */
export function silhouettePlan(seed: number, windows: number): [number, number, number] {
  const every = SILHOUETTE_EVERY_MIN_S + randAt(seed, 901) * (SILHOUETTE_EVERY_MAX_S - SILHOUETTE_EVERY_MIN_S);
  return [every, randAt(seed, 902) * every, Math.floor(randAt(seed, 903) * Math.max(1, windows))];
}

/**
 * A passing silhouette at time t: progress 0..1 across its window, or -1 when
 * none is passing. Which window comes from the plan, changing each pass.
 */
export function silhouetteAt(plan: readonly number[], windows: number, t: number): { p: number; w: number } {
  'worklet';
  const every = plan[0];
  const offset = plan[1];
  if (!(every > 0) || windows <= 0) return { p: -1, w: 0 };
  const s = t + offset;
  const pass = Math.floor(s / every);
  const into = s - pass * every;
  if (into > SILHOUETTE_CROSS_S) return { p: -1, w: 0 };
  const w = (plan[2] + pass) % windows;
  return { p: into / SILHOUETTE_CROSS_S, w };
}
