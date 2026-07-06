/**
 * constants.ts — Sharky Swim tuning.
 *
 * All physics runs in a FIXED-TIMESTEP worklet (GameLoop) so these values are
 * expressed in real-world units per second and stay deterministic regardless
 * of frame rate. Everything a designer would tweak lives here.
 */

/** Difficulty knob passed from session context (1 = easy, 3 = hard). */
export type Difficulty = 1 | 2 | 3;

/** Round length window (seconds). Session picks within 60-120s. */
export const ROUND_SECONDS = 75;

/**
 * Coyote time: how long AFTER the shark clips an obstacle we still let a tap
 * "save" the run. This is the tap-to-swim forgiveness the spec calls for
 * (120ms). Implemented as a grace timer, not a hitbox fudge, so the shark can
 * physically overlap for up to this long before it counts as a crash.
 */
export const COYOTE_MS = 120;

/** Shark world geometry (logical px; scaled to the canvas at render time). */
export const SHARK = {
  /** Fixed horizontal position (fraction of width). Classic side-scroller. */
  xFrac: 0.28,
  /** Collision half-size (px) — a touch smaller than the sprite for fairness. */
  halfW: 30,
  halfH: 20,
  /** Gravity pulling the shark down (px/s^2). */
  gravity: 1650,
  /** Upward impulse applied on a swim tap (px/s, negative = up). */
  swimImpulse: -560,
  /** Terminal fall / rise speeds (px/s). */
  maxFall: 820,
  maxRise: -620,
  /** Sprite draw size (px). */
  drawW: 88,
  drawH: 64,
  /** Swim flipbook frame rate (fps) — the 3-frame cycle. */
  frameFps: 12,
} as const;

/** Parallax layer scroll speeds as a fraction of the world scroll speed. */
export const PARALLAX = {
  back: 0.25,
  mid: 0.55,
  front: 1.0,
} as const;

/**
 * Per-difficulty tuning. gapFrac is the vertical opening as a fraction of the
 * playfield height; baseSpeed is the starting world scroll (px/s); speedRamp is
 * how much px/s we add per second survived; spacing is horizontal distance
 * between obstacle pairs (px).
 */
export const DIFFICULTY: Record<Difficulty, {
  gapFrac: number;
  baseSpeed: number;
  speedRamp: number;
  maxSpeed: number;
  spacing: number;
}> = {
  1: { gapFrac: 0.42, baseSpeed: 180, speedRamp: 3.5, maxSpeed: 360, spacing: 300 },
  2: { gapFrac: 0.34, baseSpeed: 215, speedRamp: 5.0, maxSpeed: 430, spacing: 270 },
  3: { gapFrac: 0.28, baseSpeed: 250, speedRamp: 6.5, maxSpeed: 500, spacing: 245 },
};

/** Obstacle (kelp/rock pillar) rendering. */
export const OBSTACLE = {
  width: 68,
  /** Rounded-cap radius. */
  cap: 16,
  /** Min distance of a gap center from the top/bottom edge (px). */
  edgePad: 70,
} as const;

/** Golden-ring bonus. Rings float in the gaps; a chain (fever) rewards streaks. */
export const RING = {
  radius: 30,
  /** Collect half-size for the shark→ring overlap test (px). */
  collectR: 46,
  /** Base points for a single ring. */
  points: 25,
  /** Chance (0-1) a passed gap also spawns a ring to collect. */
  spawnChance: 0.72,
  /** Draw size (px). */
  drawSize: 60,
} as const;

/** Scoring. Passing a gap is the core score; rings + combo multiply it. */
export const SCORING = {
  /** Points for clearing an obstacle gap. */
  gapPoints: 10,
} as const;

/** Max simultaneous obstacles / rings kept in the pools. */
export const POOL = {
  obstacles: 8,
  rings: 8,
} as const;

/** AsyncStorage key for personal best (per difficulty is overkill; keep one). */
export const PB_KEY = '@sharky_swim/best';

/** Screen-shake budget on a crash (ms, honors gamekit MAX_SHAKE_MS). */
export const CRASH_SHAKE_MS = 120;
