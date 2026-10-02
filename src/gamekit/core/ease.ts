/**
 * ease.ts: easing, springs and motion recipes as pure worklet functions.
 *
 * Everything takes numbers and returns numbers, so the same curve drives a
 * Skia RSXform on the UI thread, a Reanimated style, or a node test. Recipes
 * encode the studio's animation grammar: anticipation, action, overshoot and
 * settle, squash and stretch with volume preservation, pops and slams.
 */

export function clamp(v: number, lo: number, hi: number): number {
  'worklet';
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  'worklet';
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  'worklet';
  return a === b ? 0 : (v - a) / (b - a);
}

export function remap(v: number, a0: number, a1: number, b0: number, b1: number, clampIt = true): number {
  'worklet';
  const t = invLerp(a0, a1, v);
  return lerp(b0, b1, clampIt ? clamp01(t) : t);
}

export function smoothstep(e0: number, e1: number, v: number): number {
  'worklet';
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential approach (lambda ~ 1/time-constant). */
export function damp(current: number, target: number, lambda: number, dtSec: number): number {
  'worklet';
  return lerp(current, target, 1 - Math.exp(-lambda * dtSec));
}

// =============================================================================
// Easing curves. All map [0,1] -> [0,1] (back/elastic overshoot by design).
// =============================================================================

export type EaseName =
  | 'linear'
  | 'inQuad' | 'outQuad' | 'inOutQuad'
  | 'inCubic' | 'outCubic' | 'inOutCubic'
  | 'inQuart' | 'outQuart'
  | 'outExpo'
  | 'inSine' | 'outSine' | 'inOutSine'
  | 'inBack' | 'outBack' | 'inOutBack'
  | 'outElastic' | 'outBounce';

export function ease(name: EaseName, t: number, s = 1.70158): number {
  'worklet';
  const x = clamp01(t);
  switch (name) {
    case 'linear': return x;
    case 'inQuad': return x * x;
    case 'outQuad': return 1 - (1 - x) * (1 - x);
    case 'inOutQuad': return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case 'inCubic': return x * x * x;
    case 'outCubic': return 1 - Math.pow(1 - x, 3);
    case 'inOutCubic': return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'inQuart': return x * x * x * x;
    case 'outQuart': return 1 - Math.pow(1 - x, 4);
    case 'outExpo': return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
    case 'inSine': return 1 - Math.cos((x * Math.PI) / 2);
    case 'outSine': return Math.sin((x * Math.PI) / 2);
    case 'inOutSine': return -(Math.cos(Math.PI * x) - 1) / 2;
    case 'inBack': return (s + 1) * x * x * x - s * x * x;
    case 'outBack': {
      const y = x - 1;
      return 1 + (s + 1) * y * y * y + s * y * y;
    }
    case 'inOutBack': {
      const c = s * 1.525;
      return x < 0.5
        ? (Math.pow(2 * x, 2) * ((c + 1) * 2 * x - c)) / 2
        : (Math.pow(2 * x - 2, 2) * ((c + 1) * (x * 2 - 2) + c) + 2) / 2;
    }
    case 'outElastic': {
      if (x === 0 || x === 1) return x;
      return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    }
    case 'outBounce': {
      const n = 7.5625;
      const d = 2.75;
      let y = x;
      if (y < 1 / d) return n * y * y;
      if (y < 2 / d) { y -= 1.5 / d; return n * y * y + 0.75; }
      if (y < 2.5 / d) { y -= 2.25 / d; return n * y * y + 0.9375; }
      y -= 2.625 / d;
      return n * y * y + 0.984375;
    }
  }
  return x;
}

/** Tween a value from a to b over [start, start+dur] at time `now`. */
export function tweenAt(a: number, b: number, start: number, dur: number, now: number, curve: EaseName = 'outCubic'): number {
  'worklet';
  if (dur <= 0) return now >= start ? b : a;
  return lerp(a, b, ease(curve, (now - start) / dur));
}

// =============================================================================
// Keyframe tracks
// =============================================================================

/**
 * A keyframe track: times (ms, ascending) and values, with one ease per
 * segment (segment i runs from t[i] to t[i+1]). Holds the ends.
 */
export interface Track {
  t: number[];
  v: number[];
  e?: EaseName[];
}

export function evalTrack(track: Track, time: number): number {
  'worklet';
  const n = track.t.length;
  if (n === 0) return 0;
  if (time <= track.t[0]) return track.v[0];
  if (time >= track.t[n - 1]) return track.v[n - 1];
  for (let i = 0; i < n - 1; i++) {
    const t0 = track.t[i];
    const t1 = track.t[i + 1];
    if (time <= t1) {
      const curve = track.e && track.e[i] ? track.e[i] : 'linear';
      return lerp(track.v[i], track.v[i + 1], ease(curve, (time - t0) / (t1 - t0)));
    }
  }
  return track.v[n - 1];
}

export function trackDuration(track: Track): number {
  'worklet';
  return track.t.length ? track.t[track.t.length - 1] : 0;
}

// =============================================================================
// Motion recipes (the studio animation grammar)
// =============================================================================

/**
 * Anticipation -> action -> overshoot -> settle, as one progress curve.
 * Returns progress (0 at rest, 1 at the target) that dips below 0 during the
 * wind-up and passes 1 during the overshoot. Total time = antMs + actMs + settleMs.
 */
export function anticipate(
  elapsedMs: number,
  antMs = 90,
  actMs = 140,
  settleMs = 220,
  dip = 0.12,
  overshoot = 0.12,
): number {
  'worklet';
  if (elapsedMs <= 0) return 0;
  if (elapsedMs < antMs) return -dip * ease('outQuad', elapsedMs / antMs);
  const a = elapsedMs - antMs;
  if (a < actMs) return lerp(-dip, 1 + overshoot, ease('outCubic', a / actMs));
  const s = a - actMs;
  if (s < settleMs) {
    // Damped settle: one soft counter-swing then rest.
    const u = s / settleMs;
    return 1 + overshoot * Math.cos(u * Math.PI * 1.5) * (1 - u) * (1 - u);
  }
  return 1;
}

/** Volume-preserving squash/stretch. amount>0 stretches Y, amount<0 squashes. */
export function squashStretch(amount: number): { sx: number; sy: number } {
  'worklet';
  const sy = 1 + amount;
  const safe = sy < 0.2 ? 0.2 : sy;
  return { sx: 1 / Math.sqrt(safe), sy: safe };
}

/**
 * Impact squash that recovers with a wobble: returns the Y scale over time
 * after a hit (X is 1/sqrt(Y) for volume). Peak squash `depth` at t=0.
 */
export function impactSquash(elapsedMs: number, depth = 0.16, recoverMs = 260): number {
  'worklet';
  if (elapsedMs <= 0) return 1 - depth;
  if (elapsedMs >= recoverMs) return 1;
  const u = elapsedMs / recoverMs;
  return 1 - depth * Math.cos(u * Math.PI * 2.5) * Math.pow(1 - u, 2);
}

/**
 * Pop: 0 -> peak -> 1 (popIn) or 1 -> peak -> 1 (punch). `from` sets the start.
 * inMs rises with outQuad, then a damped spring-like settle over settleMs.
 */
export function popScale(elapsedMs: number, peak = 1.18, inMs = 90, settleMs = 260, from = 1): number {
  'worklet';
  if (elapsedMs <= 0) return from;
  if (elapsedMs < inMs) return lerp(from, peak, ease('outQuad', elapsedMs / inMs));
  const s = elapsedMs - inMs;
  if (s >= settleMs) return 1;
  const u = s / settleMs;
  return 1 + (peak - 1) * Math.cos(u * Math.PI * 1.5) * Math.pow(1 - u, 2);
}

/** Slam-in (big -> 1 with a hard stop and a tiny bounce), e.g. FEVER!, stars. */
export function slamScale(elapsedMs: number, from = 2.2, inMs = 140, settleMs = 180): number {
  'worklet';
  if (elapsedMs <= 0) return from;
  if (elapsedMs < inMs) return lerp(from, 0.92, ease('inQuad', elapsedMs / inMs));
  const s = elapsedMs - inMs;
  if (s >= settleMs) return 1;
  return lerp(0.92, 1, ease('outBack', s / settleMs, 2.2));
}

/** Damped shake offset (px) for a UI element; zero after durMs. */
export function wobble(elapsedMs: number, amp = 6, durMs = 150, hz = 22): number {
  'worklet';
  if (elapsedMs < 0 || elapsedMs >= durMs) return 0;
  const u = elapsedMs / durMs;
  return amp * Math.sin((elapsedMs / 1000) * hz * Math.PI * 2) * (1 - u);
}

/** Stagger helper: start time of item i. */
export function staggerAt(index: number, stepMs: number, baseMs = 0): number {
  'worklet';
  return baseMs + index * stepMs;
}

// =============================================================================
// Springs (semi-implicit Euler, sub-stepped: stable at any frame rate)
// =============================================================================

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface SpringState {
  x: number;
  v: number;
}

export function springStep(state: SpringState, target: number, cfg: SpringConfig, dtSec: number): SpringState {
  'worklet';
  let remaining = dtSec > 0.064 ? 0.064 : dtSec;
  while (remaining > 0) {
    const h = remaining > 1 / 240 ? 1 / 240 : remaining;
    const force = -cfg.stiffness * (state.x - target) - cfg.damping * state.v;
    state.v += (force / cfg.mass) * h;
    state.x += state.v * h;
    remaining -= h;
  }
  return state;
}

export function springAtRest(state: SpringState, target: number, eps = 0.001): boolean {
  'worklet';
  return Math.abs(state.x - target) < eps && Math.abs(state.v) < eps * 10;
}

/** Studio spring presets (match theme JUICE where they overlap). */
export const SPRINGS = {
  pop: { damping: 9, stiffness: 320, mass: 0.6 },
  settle: { damping: 14, stiffness: 180, mass: 0.9 },
  press: { damping: 12, stiffness: 400, mass: 0.5 },
  kick: { damping: 12, stiffness: 500, mass: 1 },
  wobbly: { damping: 8, stiffness: 180, mass: 1 },
  emerge: { damping: 10, stiffness: 380, mass: 0.5 },
} as const;

// =============================================================================
// Beat helpers (music-synced FX)
// =============================================================================

/** Phase [0,1) within the current beat for bpm at time ms since anchor. */
export function beatPhase(ms: number, bpm: number): number {
  'worklet';
  const beatMs = 60000 / bpm;
  const p = (ms % beatMs) / beatMs;
  return p < 0 ? p + 1 : p;
}

/** A beat "bop": sharp attack at the beat, exponential decay. */
export function beatBop(ms: number, bpm: number, sharpness = 6): number {
  'worklet';
  return Math.exp(-sharpness * beatPhase(ms, bpm));
}
