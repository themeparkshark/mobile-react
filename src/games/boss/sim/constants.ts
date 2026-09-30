/**
 * Boss Brawl v4 sim constants. Integer-only (design 10.8): every time is an
 * int ms, every value an int, and the beat grid is a quarter-beat table per
 * boss and bout, locked to Chris's loop edits (Kraken 129.2 BPM, Robo 136,
 * Ghost 117.5; Fury loops run x1.06).
 *
 * The server replay (WS6, PHP) mirrors this file one to one.
 */

export type BossId = 'kraken' | 'robo_shark' | 'ghost_squid';
export const BOSS_IDS: readonly BossId[] = ['kraken', 'robo_shark', 'ghost_squid'];

/** Quarter-beat (ms) per boss per bout. Bout 3 plays the x1.06 Fury loop. */
export const QUARTER: Record<BossId, readonly [number, number, number]> = {
  kraken: [116, 116, 110],
  robo_shark: [110, 110, 104],
  ghost_squid: [128, 128, 120],
};

export const BOUTS = 3;
/** Attacks per bout (bout 3 gets +1 per Break this round, cap +2). */
export const ATTACKS = [3, 4, 4] as const;
/** Wind-up in quarter beats (2 / 1.5 / 1.25 beats). Walking adds one sixteenth. */
export const WINDUP_Q = [8, 6, 5] as const;
/** Opening length in quarter beats (4 / 3.5 / 3 beats). */
export const OPENING_Q = [16, 14, 12] as const;
/** Crit rings in an opening after a GOOD counter; PERFECT adds a half-beat ring. */
export const RINGS = [3, 3, 2] as const;
/** Recover after an opening, in quarter beats (2 / 1 / 0.75 beats). */
export const RECOVER_Q = [8, 4, 3] as const;
/** Lead-in before the first tell of a bout (2 beats). */
export const LEAD_Q = 8;

// Timing windows (ms, relative to the impact frame I, after the device offset)
export const GOOD_MAX = 600;
export const BUFFER_MS = 120;
export const PERFECT_EARLY = 160;
export const PERFECT_LATE = 40;
export const COYOTE_MS = 90;
export const RING_CRIT_MS = 80;
export const HEAVY_WINDOW_MS = 100;
export const FINISHER_PERFECT_MS = 110;
export const FINISHER_GOOD_MS = 250;
export const FINISHER_HOLD_MS = 400;
export const OFFSET_CLAMP = 120;

// Lockouts and guard
export const PUNISH_MS = 800;
export const CLOSE_GRACE_MS = 250;
export const CLOSE_WARN_MS = 250;
export const GUARD_TAPS = 5;
export const GUARD_WINDOW_MS = 1000;
export const GUARD_SWAT_MS = 250;
export const DIZZY_MS = 900;
export const HAZARD_MS = 1500;

// Break (gauge in tenths: 0..1000)
export const GAUGE_MAX = 1000;
export const BREAK_FREEZE = [140, 160, 180] as const;
export const BREAK_Q = 24; // 6 beats of dizzy
/** Break crit rings close every beat (tuned from every half beat: see balance test). */
export const BREAK_RING_Q = 4;
export const BREAK_MAX = 3;
export const BONUS_ATTACK_CAP = 2;
export const GAIN = {
  perfect: 220, good: 140, crit: 60, hit: 15, heavy: 120, hazard: 60, tide: 300, surge: 200, rescue: 60,
} as const;
export const LOSS = { punish: 80, guard: 100 } as const;

// Finisher
export const FINISHER_Q = 24;
export const FINISHER_FREEZE = 220;
export const KO_FREEZE = 300;
export const FINISHER_GAUGE_MIN = 600;

/**
 * Points. Design 7.1 ratios, scaled by the node balance sim (tools/tests/boss-sim.test.cjs)
 * so the median bot lands near 1 150 and mastery near 3 000, inside what the live raid
 * endpoint can encode (26 s x 7 hits/s). Crit vs hit widened so ring timing, not tap
 * speed, is the biggest term between median and mastery.
 */
export const PTS = {
  hit: 4, crit: 23, heavy: 58, perfect: 16, good: 6, hazard: 3, breakLump: 70,
  finisherPerfect: 200, finisherGood: 120,
} as const;
/** Multipliers as integer percents. */
export const MULT = { normal: 100, break: 150, ally: 125 } as const;
/** Scoring unit: points x combo pct x mult pct. One floor per bout. */
export const UNIT = 10000;

/** Combo chain -> integer percent (x1.0 / x1.2 / x1.5 / x2.0 FURY). */
export function comboPct(chain: number): number {
  if (chain >= 10) return 200;
  if (chain >= 6) return 150;
  if (chain >= 3) return 120;
  return 100;
}

/** Star thresholds (display only; rewards stay server-side). */
export const STAR_POINTS = { one: 300, two: 1000, three: 2600 } as const;

// Input kinds (the proof's `k`)
export const IN_TARGET = 0;
export const IN_PAD_DOWN = 1;
export const IN_PAD_UP = 2;
export const IN_PAUSE = 3;
export const IN_RESUME = 4;
export const IN_ALLY = 5;
export const IN_END = 6;
export const IN_SURGE = 7;
export const IN_RESCUE = 8;
