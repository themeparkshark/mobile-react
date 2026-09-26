/**
 * constants.ts — Rhythm Tap tuning.
 *
 * Single source of truth for the game's timing, scoring, difficulty and
 * visuals. Everything the judge worklet and the field renderer read comes from
 * here so tuning never drifts between the JS and UI threads.
 */

import { GAME_COLORS } from '../../gamekit';

// =============================================================================
// TEMPO / CLOCK
// =============================================================================

/** Beats per minute the whole game runs at. */
export const BPM = 100;

/** Milliseconds between beats. 100bpm → 600ms. */
export const BEAT_MS = 60000 / BPM;

/**
 * How long a target's ring is visible before its beat lands. The ring spawns at
 * (hitTime - APPROACH_MS) and its radius shrinks to the target radius exactly at
 * hitTime. Two beats of lead-in reads clearly at 100bpm without crowding.
 */
export const APPROACH_MS = BEAT_MS * 2;

/**
 * Grace after a target's beat before it auto-misses. If the player hasn't
 * tapped within this window past hitTime, the target expires as a Miss.
 */
export const MISS_GRACE_MS = 170;

/** Count-in beats played (metronome only) before the first target lands. */
export const LEAD_IN_BEATS = 4;

// =============================================================================
// JUDGMENT WINDOWS (± ms around the target beat)
// =============================================================================

/**
 * Absolute timing error thresholds, judged against the UI-thread clock at the
 * exact frame the tap is registered (see RhythmField judge worklet). These are
 * the spec windows: Perfect ±40ms, Great ±90ms, Good ±150ms.
 */
export const WINDOW = {
  perfect: 40,
  great: 90,
  good: 150,
} as const;

export type Judgment = 'perfect' | 'great' | 'good' | 'miss';

/** Base points per judgment (before combo multiplier). */
export const JUDGMENT_SCORE: Record<Judgment, number> = {
  perfect: 300,
  great: 150,
  good: 75,
  miss: 0,
};

/** Numeric code for a judgment, passed across the worklet→JS boundary. */
export const JUDGMENT_CODE: Record<Judgment, number> = {
  miss: 0,
  good: 1,
  great: 2,
  perfect: 3,
};

export const JUDGMENT_BY_CODE: Judgment[] = ['miss', 'good', 'great', 'perfect'];

// =============================================================================
// DIFFICULTY — density of the 8-hit patterns
// =============================================================================

export interface DifficultySpec {
  /** How many patterns (each 8 slots) to play in a round. */
  patternCount: number;
  /**
   * Probability a given eighth-note slot carries a target. Higher = denser
   * (more taps, more offbeats). Onbeats are always eligible; this gates the
   * offbeat / syncopated slots.
   */
  density: number;
  /** Human label for the objective line. */
  label: string;
}

export const DIFFICULTY: Record<1 | 2 | 3, DifficultySpec> = {
  1: { patternCount: 6, density: 0.35, label: 'Warm-up groove' },
  2: { patternCount: 8, density: 0.55, label: 'Keep the beat' },
  3: { patternCount: 10, density: 0.8, label: 'Full tilt' },
};

/** Slots per pattern (eighth notes over two bars of 4/4 at the chosen BPM). */
export const SLOTS_PER_PATTERN = 8;

/** Duration of one slot (an eighth note). */
export const SLOT_MS = BEAT_MS / 2;

// =============================================================================
// STARS — score thresholds as a fraction of the theoretical max
// =============================================================================

/** Fraction of max score needed for 1 / 2 / 3 stars. */
export const STAR_THRESHOLDS = { one: 0.4, two: 0.65, three: 0.85 } as const;

// =============================================================================
// VISUALS
// =============================================================================

/** Target (hit zone) radius in px — the ring shrinks down to meet this. */
export const TARGET_RADIUS = 46;

/** Ring stroke width in px. */
export const RING_STROKE = 7;

/** How large the approaching ring starts, as a multiple of TARGET_RADIUS. */
export const RING_START_SCALE = 3.4;

export const RHYTHM_COLORS = {
  target: GAME_COLORS.gold,
  ring: '#ffffff',
  perfect: GAME_COLORS.gold,
  great: GAME_COLORS.blue,
  good: GAME_COLORS.success,
  miss: GAME_COLORS.danger,
  beatBar: GAME_COLORS.gold,
  beatBarFever: GAME_COLORS.coral,
  bgTop: GAME_COLORS.bgDeep,
  bgTopFever: '#1a1030',
  bgBottom: GAME_COLORS.bgDark,
  bgBottomFever: '#3a1c52',
} as const;

/** Color for a judgment's hit burst. */
export const JUDGMENT_COLOR: Record<Judgment, string> = {
  perfect: RHYTHM_COLORS.perfect,
  great: RHYTHM_COLORS.great,
  good: RHYTHM_COLORS.good,
  miss: RHYTHM_COLORS.miss,
};
