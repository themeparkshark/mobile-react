/**
 * Boss Brawl sim constants (design: studio/design/boss.md v7.1, SIM_VERSION 8). Integer-only:
 * every time is an int ms, every value an int, and the grid is a step table
 * (one step = a 1/16 note) per boss and bout, locked to Chris's loop edits
 * (Kraken 129.2 BPM, Robo 136, Ghost 117.5; Fury loops run x1.06).
 *
 * The server replays the same file through the netcode sim bundle
 * (`tools/build-sim-bundle.mjs`, routed by {game: 'boss', sim_version}).
 */

export type BossId = 'kraken' | 'robo_shark' | 'ghost_squid';
export const BOSS_IDS: readonly BossId[] = ['kraken', 'robo_shark', 'ghost_squid'];

/**
 * Rule-set version carried in every proof. Older proofs replay with their own
 * frozen bundle (v7: tools/boss/bundles/boss-sim.6a349dc81e51.cjs).
 * v8 (design v7.1 M1.1): the per-boss counter weight is deleted (one point table for every boss),
 * combo drops one tier at each bout start, combined combo x mult capped at 250%.
 */
export const SIM_VERSION = 8;

/** One step (1/16 note, ms) per boss per bout. Bout 3 plays the x1.06 Fury loop. 1 beat = 4 steps. */
export const STEP: Record<BossId, readonly [number, number, number]> = {
  kraken: [116, 116, 110],
  robo_shark: [110, 110, 104],
  ghost_squid: [128, 128, 120],
};

export const BOUTS = 3;
/** Attacks per bout (bout 3 gets +1 per Break this round, cap +2). */
export const ATTACKS = [3, 4, 4] as const;
/** Wind-up in steps (2 / 1.5 / 1.25 beats). Walking adds one step. */
export const WINDUP_Q = [8, 6, 5] as const;
/** Opening (Pin and Pop) length in steps (4 / 3.5 / 3 beats). */
export const OPENING_Q = [16, 14, 12] as const;
/** Pop slots per opening; a PERFECT counter adds a half-beat slot. */
export const RINGS = [3, 3, 2] as const;
/** Recover after an opening, in steps (2 / 1 / 0.75 beats). */
export const RECOVER_Q = [8, 4, 3] as const;
/** Lead-in before the first tell of a bout (2 beats). */
export const LEAD_Q = 8;

// Counter windows (ms, relative to the impact frame I, after the device offset)
export const GOOD_MAX = 600;
export const BUFFER_MS = 120;
export const PERFECT_EARLY = 160;
export const PERFECT_LATE = 40;
export const COYOTE_MS = 90;
export const OFFSET_CLAMP = 120;
/**
 * Reflex grace: taps in the first 250 ms after a tell starts are reflexes, not
 * reads (a kid's panic burst, a walking bump). They are soft early ticks on any
 * lane and never land the tell or count as a counter.
 */
export const READ_GRACE_MS = 250;

// Pin and Pop windows (relative to a slot's ring close)
export const POP_MS = 110;
export const POP_PERFECT_MS = 50;
/** Long Look boon widens POP. */
export const POP_LONG_MS = 130;
/** Look-ahead (steps before a slot's ring close): 1 beat, 2 while walking or with Long Look. */
export const LOOK_Q = 4;
export const LOOK_WALK_Q = 8;
/** Final Pop ring approaches over 2 beats after the last slot. */
export const FINAL_Q = 8;

// Lockouts and guard
export const PUNISH_MS = 800;
export const CLOSE_GRACE_MS = 250;
export const CLOSE_WARN_MS = 250;
export const GUARD_WARN_TAPS = 3;
export const GUARD_TAPS = 5;
export const GUARD_WINDOW_MS = 1000;
export const GUARD_SWAT_MS = 250;
export const DIZZY_MS = 900;
export const HAZARD_MS = 1500;
/** Taps closer than this to the previous one are one bounce (walk bump), not two inputs. */
export const DEBOUNCE_MS = 40;

// Grit, Knockdown, TKO (design 6.1)
export const GRIT = 3;
export const GRIT_EXTRA = 4;
export const GETUP_TAPS = 8;
export const GETUP_MS = 1500;
/** Get-up taps faster than 14/s are bounces. */
export const GETUP_MIN_GAP = 71;
/** First rounds vs a boss: Grit cannot drop below this in bout 1. */
export const NOVICE_GRIT_FLOOR = 1;

// Break (gauge in tenths: 0..1000)
export const GAUGE_MAX = 1000;
/** Beat-absorbed Break freezes: the sim leaves this gap, the next onset stays on the step grid. */
export const BREAK_FREEZE = [140, 160, 180] as const;
export const BREAK_Q = 24; // 6 beats of dizzy
export const BREAK_RING_Q = 4;
export const BREAK_MAX = 3;
export const BONUS_ATTACK_CAP = 2;
export const GAIN = {
  perfect: 220, good: 140, popPerfect: 80, pop: 60, hit: 15, slam: 140, hazard: 60, tide: 300, surge: 200, rescue: 60,
} as const;
export const LOSS = { punish: 80, guard: 100 } as const;

// Final Pop / KO
export const FINAL_FREEZE = 220;
export const KO_FREEZE = 300;
export const ANCHOR_STARS_MAX = 3;

/**
 * Points (design 5.1, one table for every boss, starting values, lock after
 * Gate H). v8 re-fit for the combo decay and the 250% cap on the 200-seed node
 * sim (tools/boss/balance.cjs): median about 1 100, Easy Slam about 82%,
 * mastery about 2.85x with the Crown in most mastery rounds.
 */
export const PTS = {
  perfect: 14, good: 5, popPerfect: 27, pop: 10, hit: 2, slam: 46, hazard: 3, breakLump: 40,
  finalPerfect: 200, finalPop: 120, finalHit: 40, skillStar: 50,
} as const;
/** Multipliers as integer percents. */
export const MULT = { normal: 100, break: 150, ally: 125 } as const;
/** Scoring unit: points x combo pct x mult pct. One floor per bout. */
export const UNIT = 10000;
/** Combined combo % x mult % cap (design 5.2): 250%, i.e. 25 000 in pct x pct units. */
export const COMBINED_CAP = 25000;

/** Combo chain -> integer percent (x1.0 / x1.2 / x1.5 / x2.0 FURY). */
export function comboPct(chain: number): number {
  if (chain >= 10) return 200;
  if (chain >= 6) return 150;
  if (chain >= 3) return 120;
  return 100;
}

/**
 * Combo decay at a bout start (design 5.2): the chain drops to the floor of the
 * tier below (FURY 10+ -> 6, 6-9 -> 3, 3-5 -> 0, 0-2 -> 0).
 */
export function decayChain(chain: number): number {
  if (chain >= 10) return 6;
  if (chain >= 6) return 3;
  return 0;
}

/** Star thresholds and the Crown (design 9.3; display only, rewards stay server-side). */
export const STAR_POINTS = { one: 300, two: 1000, three: 2200, crown: 2900 } as const;

// Boons (design 6.3): one of two seeded cards at each intermission.
export const BOON_NONE = 0;
export const BOON_TIDE = 1; // Rising Tide: start at +300 Break
export const BOON_FIN = 2; // Extra Fin: start with 4 Grit
export const BOON_LOOK = 3; // Long Look: 2-beat look-ahead, POP +-130
export const BOON_POLISH = 4; // Anchor Polish (bout 3 only): 1 Anchor Star lit

// Input kinds (the proof's `k`)
export const IN_TARGET = 0;
export const IN_PAD_DOWN = 1;
export const IN_PAD_UP = 2;
export const IN_PAUSE = 3;
export const IN_RESUME = 4;
export const IN_ALLY = 5; // parked (flag)
export const IN_END = 6;
export const IN_SURGE = 7; // parked (flag)
export const IN_RESCUE = 8; // parked (flag)
export const IN_GETUP = 9;
export const IN_BOON = 10;
