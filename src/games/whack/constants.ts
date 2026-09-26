/**
 * constants.ts — Whack-a-Shark tuning.
 *
 * Everything a designer would tweak lives here. Timings are in milliseconds
 * (the spawn scheduler is a JS-thread control loop, not a physics sim), while
 * the per-hole squash/stretch runs on the UI thread via Reanimated.
 */

/** Difficulty knob passed from session context (1 = easy, 3 = hard). */
export type Difficulty = 1 | 2 | 3;

/** Fixed 3x3 grid. */
export const GRID_COLS = 3;
export const GRID_ROWS = 3;
export const HOLE_COUNT = GRID_COLS * GRID_ROWS; // 9

/** Round length (seconds). Session picks within 60-120s; whack sits at 60. */
export const ROUND_SECONDS = 60;
/** A ride-coin claim should be playable while stopping briefly at a ride. */
export const RIDE_ROUND_SECONDS = 25;
/** Ride challenge goal: whack this many sharks before time runs out (golden counts 2). */
export const RIDE_GOAL_SHARKS = 10;

/**
 * Pace curve. Spawn interval EASES from slow to fast across the round so the
 * difficulty ramps without a cliff. `from` is the opening gap between spawns,
 * `to` is the frantic end-of-round gap. Eased with a smoothstep on elapsed
 * fraction (see engine).
 */
export const PACE = {
  intervalFromMs: 1100,
  intervalToMs: 450,
  /** Fever halves the effective interval (spawn rate doubles). */
  feverIntervalScale: 0.5,
} as const;

/**
 * How long a target stays up before it ducks back down on its own (a miss for
 * sharks). Scales down slightly with difficulty so hard mode gives less time.
 */
export const UP_TIME_MS: Record<Difficulty, { shark: number; special: number }> = {
  1: { shark: 1150, special: 950 },
  2: { shark: 950, special: 820 },
  3: { shark: 800, special: 700 },
};

/**
 * Spawn composition per difficulty. Weights are relative; the engine picks a
 * kind by weighted roll. Golden is rare (the x5 + fever trigger). Decoys grow
 * with difficulty to punish mashing.
 */
export const SPAWN_WEIGHTS: Record<Difficulty, { shark: number; decoy: number; golden: number }> = {
  1: { shark: 82, decoy: 12, golden: 6 },
  2: { shark: 72, decoy: 23, golden: 5 },
  3: { shark: 62, decoy: 34, golden: 4 },
};

/** Max simultaneous targets up at once, per difficulty (keeps it fair). */
export const MAX_ACTIVE: Record<Difficulty, number> = { 1: 2, 2: 3, 3: 4 };

/** What kind of thing is poking out of a hole. */
export type TargetKind = 'shark' | 'decoy' | 'golden';

/** Scoring. Base points, multiplied by the live combo multiplier. */
export const SCORING = {
  /** Base points for whacking a normal shark. */
  sharkPoints: 100,
  /** Golden shark base points — before its own x5 and the combo multiplier. */
  goldenBase: 100,
  /** Golden shark score multiplier (the "x5" from the spec). */
  goldenMultiplier: 5,
  /** Penalty for tapping a decoy anglerfish. */
  decoyPenalty: 150,
  /** Score floor — a run can't go negative. */
  floor: 0,
} as const;

/** Animation timings for the pop (anticipation squash → overshoot → settle). */
export const POP = {
  /** How long the rise-and-settle takes (ms) — visual only. */
  riseMs: 220,
  /** How long the duck-back takes when a target retires (ms). */
  duckMs: 160,
  /** Squash floor for the wind-up dip (scale). */
  windupScale: 0.72,
  /** Overshoot peak on the pop (scale). */
  overshootScale: 1.12,
} as const;

/** Screen-shake budget when a decoy is tapped (ms, honors MAX_SHAKE_MS). */
export const DECOY_SHAKE_MS = 120;

/** Star thresholds by score. Tuned so a decent 60s run earns 1-2 stars. */
export const STAR_THRESHOLDS = { one: 800, two: 2200, three: 4200 } as const;
export const RIDE_STAR_THRESHOLDS = { one: 500, two: 1400, three: 2700 } as const;

/** AsyncStorage key for personal best. */
export const PB_KEY = '@whack_a_shark/best';
export const RIDE_PB_KEY = '@whack_a_shark/ride_best';
