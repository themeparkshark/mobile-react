/**
 * Banana Basket — tuning constants.
 *
 * All gameplay numbers live here so difficulty balancing never touches the
 * engine or render code. Values are chosen for a 90-120s one-thumb round on a
 * phone held in portrait, in a moving queue line.
 */

/** Falling item kinds. Numeric so the value can live in a worklet struct. */
export const ITEM = {
  BANANA: 0,
  BOMB: 1,
  CHURRO: 2,
} as const;

export type ItemKind = (typeof ITEM)[keyof typeof ITEM];

/** Hard cap on simultaneously-live falling items (pooled, zero-alloc). */
export const MAX_ITEMS = 18;

/** Round length in seconds. */
export const ROUND_SECONDS = 90;

/** Basket sits in the bottom third; this is its center Y as a fraction of H. */
export const BASKET_Y_FRAC = 0.82;

/** Basket sprite draw size (px, logical). Scales the catch mouth too. */
export const BASKET_W = 118;
export const BASKET_H = 96;

/**
 * The catch zone is the basket's open mouth. It is narrower than the full
 * sprite (the rim), sits near the top of the basket, and is where an item must
 * cross to count as caught.
 */
export const CATCH_INSET_X = 16; // px trimmed from each side of the sprite
export const CATCH_MOUTH_TOP = 0.18; // fraction down from basket top where the mouth begins
export const CATCH_MOUTH_H = 0.45; // fraction of basket height the mouth spans

/** Falling item draw size (px, logical). */
export const ITEM_SIZE = 56;
export const CHURRO_SIZE = 62;

/** Item collision radius for catch/miss tests (px). */
export const ITEM_RADIUS = 26;

/** Points. */
export const POINTS = {
  BANANA: 10,
  CHURRO: 25, // golden churro — the combo/fever driver
} as const;

/** A bomb caught or a banana missed costs the player. */
export const MISS_PENALTY = 40; // banana that falls past the basket
export const BOMB_PENALTY = 120; // catching a bomb
/** Lives model: bombs and floor-misses drain the meter; 0 ends the round. */
export const START_LIVES = 3;

/** Score never goes below zero. */
export const MIN_SCORE = 0;

// -- Near-miss slow-mo (quality bar / spec) ----------------------------------
/**
 * When a BOMB passes the basket without being caught but within this many px of
 * the basket's edge, we treat it as a "near miss" and dip the game timescale to
 * NEAR_MISS_SCALE for NEAR_MISS_MS, for a slow-mo whoosh moment.
 */
export const NEAR_MISS_RADIUS = 46;
export const NEAR_MISS_SCALE = 0.35;
export const NEAR_MISS_MS = 80;
/** Cooldown so a cluster of bombs can't chain slow-mo into a stutter. */
export const NEAR_MISS_COOLDOWN_MS = 650;

// -- Difficulty (1-3), chosen by session context -----------------------------
export interface Difficulty {
  /** Base fall speed (px/s) at round start. */
  fallSpeed: number;
  /** Fall speed added per second of elapsed play (ramp). */
  fallRamp: number;
  /** Seconds between spawns at round start. */
  spawnEvery: number;
  /** Spawn interval floor as the round accelerates. */
  spawnMin: number;
  /** How fast the spawn interval tightens (per second). */
  spawnRamp: number;
  /** Probability an item is a bomb (0-1). */
  bombChance: number;
  /** Probability an item is a golden churro (0-1). */
  churroChance: number;
  /** How many items a frenzy burst drops at once. */
  frenzyCount: number;
  /** Seconds between frenzy bursts. */
  frenzyEvery: number;
}

export const DIFFICULTY: Record<1 | 2 | 3, Difficulty> = {
  1: {
    fallSpeed: 190,
    fallRamp: 6,
    spawnEvery: 1.15,
    spawnMin: 0.62,
    spawnRamp: 0.006,
    bombChance: 0.14,
    churroChance: 0.1,
    frenzyCount: 4,
    frenzyEvery: 18,
  },
  2: {
    fallSpeed: 235,
    fallRamp: 9,
    spawnEvery: 0.95,
    spawnMin: 0.48,
    spawnRamp: 0.008,
    bombChance: 0.2,
    churroChance: 0.11,
    frenzyCount: 5,
    frenzyEvery: 15,
  },
  3: {
    fallSpeed: 285,
    fallRamp: 12,
    spawnEvery: 0.78,
    spawnMin: 0.38,
    spawnRamp: 0.01,
    bombChance: 0.26,
    churroChance: 0.12,
    frenzyCount: 6,
    frenzyEvery: 12,
  },
};

/** Star thresholds as a fraction of a difficulty-scaled target score. */
export const STAR_TARGET_BASE = 900;

/** AsyncStorage key for the personal best. */
export const BEST_KEY = 'bananaBasket.best.v1';
