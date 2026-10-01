/**
 * scoring.ts: stars, next-star goals, personal bests, count-ups and flurry
 * tallies. Pure and worklet-safe.
 */

export interface StarThresholds {
  /** Scores for 1, 2 and 3 stars (ascending). */
  one: number;
  two: number;
  three: number;
}

export function starsFor(score: number, t: StarThresholds): number {
  'worklet';
  if (score >= t.three) return 3;
  if (score >= t.two) return 2;
  if (score >= t.one) return 1;
  return 0;
}

export interface NextStarGoal {
  /** Stars earned. */
  stars: number;
  /** The next star (1-3) or 0 when all three are earned. */
  nextStar: number;
  /** Score needed for it (0 when maxed). */
  target: number;
  /** Points still needed. */
  remaining: number;
  /** Progress 0..1 from the previous threshold to the next. */
  progress: number;
  /** True when within 15% of the next star (drives "so close!" drama). */
  near: boolean;
}

export function nextStarGoal(score: number, t: StarThresholds): NextStarGoal {
  'worklet';
  const stars = starsFor(score, t);
  if (stars >= 3) return { stars, nextStar: 0, target: 0, remaining: 0, progress: 1, near: false };
  const lo = stars === 0 ? 0 : stars === 1 ? t.one : t.two;
  const hi = stars === 0 ? t.one : stars === 1 ? t.two : t.three;
  const span = hi - lo;
  const progress = span > 0 ? Math.max(0, Math.min(1, (score - lo) / span)) : 0;
  return {
    stars,
    nextStar: stars + 1,
    target: hi,
    remaining: Math.max(0, hi - score),
    progress,
    near: progress >= 0.85,
  };
}

export interface BestResult {
  isNewBest: boolean;
  previous: number;
  best: number;
  delta: number;
}

export function compareBest(score: number, previousBest: number | undefined | null): BestResult {
  'worklet';
  const prev = previousBest ?? 0;
  const isNewBest = score > prev && score > 0;
  return { isNewBest, previous: prev, best: isNewBest ? score : prev, delta: score - prev };
}

/** Count-up duration that scales with the jump (short hops stay snappy). */
export function countUpMs(from: number, to: number, minMs = 250, maxMs = 1200): number {
  'worklet';
  const d = Math.abs(to - from);
  if (d === 0) return 0;
  const ms = minMs + Math.log10(1 + d) * 220;
  return ms > maxMs ? maxMs : ms;
}

/** Value shown during a count-up (outCubic, integer). */
export function countUpValue(from: number, to: number, elapsedMs: number, durMs: number): number {
  'worklet';
  if (durMs <= 0 || elapsedMs >= durMs) return to;
  if (elapsedMs <= 0) return from;
  const t = elapsedMs / durMs;
  const e = 1 - Math.pow(1 - t, 3);
  return Math.round(from + (to - from) * e);
}

/** 12345 -> "12,345" (no locale dependency, worklet-safe). */
export function formatScore(value: number): string {
  'worklet';
  const n = Math.round(value);
  const neg = n < 0;
  let s = String(neg ? -n : n);
  let out = '';
  while (s.length > 3) {
    out = ',' + s.slice(-3) + out;
    s = s.slice(0, -3);
  }
  return (neg ? '-' : '') + s + out;
}

// =============================================================================
// Flurry tally: 3+ hits inside a window merge into one running tally
// ("4 HITS +600") instead of a storm of fly-ups.
// =============================================================================

export interface FlurryState {
  windowMs: number;
  minHits: number;
  hits: number;
  points: number;
  lastAt: number;
  /** True once the flurry has enough hits to show the tally. */
  active: boolean;
}

export function createFlurry(windowMs = 900, minHits = 3): FlurryState {
  'worklet';
  return { windowMs, minHits, hits: 0, points: 0, lastAt: -1e9, active: false };
}

export const FLURRY_NONE = 0;
/** Show a normal per-hit fly-up. */
export const FLURRY_SINGLE = 1;
/** The flurry just became a tally (hide pending fly-ups, show tally). */
export const FLURRY_START = 2;
/** The running tally grew. */
export const FLURRY_GROW = 3;

export function flurryHit(f: FlurryState, now: number, points: number): number {
  'worklet';
  if (now - f.lastAt > f.windowMs) {
    f.hits = 0;
    f.points = 0;
    f.active = false;
  }
  f.hits += 1;
  f.points += points;
  f.lastAt = now;
  if (f.active) return FLURRY_GROW;
  if (f.hits >= f.minHits) {
    f.active = true;
    return FLURRY_START;
  }
  return FLURRY_SINGLE;
}

/** Returns true once (the resolve moment) when an active flurry has ended. */
export function flurryResolve(f: FlurryState, now: number, holdMs = 300): boolean {
  'worklet';
  if (f.active && now - f.lastAt > holdMs) {
    f.active = false;
    return true;
  }
  return false;
}

/**
 * Bucket tally ticks (Whack: HITS, COMBO, BONUS fill "with accelerating
 * ticks"; tick pitch climbs 0 -> +12 semitones). Returns `n` tick times over
 * `durMs`, each gap shorter than the last (accel > 1 speeds up harder), and
 * the pitch (semitones) for each tick.
 */
export function tallySchedule(n: number, durMs: number, accel = 2, maxPitch = 12): { at: number[]; pitch: number[] } {
  const at: number[] = [];
  const pitch: number[] = [];
  if (n <= 0) return { at, pitch };
  for (let k = 0; k < n; k++) {
    const u = n === 1 ? 1 : k / (n - 1);
    // Ease-in on time: early ticks are spread out, late ones bunch up.
    at.push(Math.round(durMs * (1 - Math.pow(1 - u, accel))));
    pitch.push(Math.round(u * maxPitch));
  }
  return { at, pitch };
}

/** How many ticks a tally of `value` should play (one per chunk, 3..14). */
export function tallyTickCount(value: number): number {
  if (value <= 0) return 0;
  return Math.max(3, Math.min(14, Math.ceil(Math.log10(value + 1) * 4)));
}
