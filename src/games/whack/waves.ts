/**
 * waves.ts: Bonk Rush tuning tables (design: studio/design/whack.md, sections 4-5).
 *
 * Pure data. Everything a designer tunes lives here: target kinds, tells,
 * up-times, Burst shapes per format, the unlock ladder, scoring and meters.
 * The timeline (timeline.ts) and the resolver (sim.ts) read these tables, and
 * the PHP replay port mirrors them one to one (vectors in __vectors__/).
 */

export type Difficulty = 1 | 2 | 3;
export type WhackFormat = 'ride' | 'queue' | 'daily' | 'weekly' | 'duel' | 'raid';

// -- Target kinds (ints: they live in UI-thread structs and proof vectors) ----
export const K_FINN = 0;
export const K_GOLDEN = 1;
export const K_ANGLER = 2;
export const K_HELMET = 3;
export const K_TWIN = 4;
export const K_SPRINTER = 5;
export const K_PUFFER = 6;
export const K_TENTACLE = 7;
export const K_BRUISER = 8;
export const KIND_NAMES = ['finn', 'golden', 'angler', 'helmet', 'twin', 'sprinter', 'puffer', 'tentacle', 'bruiser'] as const;

/** Tell length per kind (ms). Every tell is at least 250ms (walk-safe glance). */
export const TELL_MS = [260, 400, 340, 300, 300, 250, 260, 320, 360];
/** First-encounter tells are longer (5.4). */
export const FIRST_TELL_MS = 500;

/** Up-time U per difficulty: Finn-class (queue and ride, +15% for walking players). */
export const UP_FINN: Record<Difficulty, number> = { 1: 1320, 2: 1090, 3: 920 };
/** Up-time for specials (golden, angler, puffer). */
export const UP_SPECIAL: Record<Difficulty, number> = { 1: 1090, 2: 940, 3: 800 };
export const UP_SPRINTER = 520;
export const UP_BRUISER = 1200;
export const HELMET_EXT_MS = 350;

export function upTimeFor(kind: number, d: Difficulty): number {
  'worklet';
  if (kind === K_SPRINTER) return UP_SPRINTER;
  if (kind === K_BRUISER) return UP_BRUISER;
  if (kind === K_GOLDEN || kind === K_ANGLER || kind === K_PUFFER) return UP_SPECIAL[d];
  return UP_FINN[d];
}

/** Decoys: hitting them costs you; they never freeze the board or break streaks by escaping. */
export function isDecoy(kind: number): boolean {
  'worklet';
  return kind === K_ANGLER || kind === K_PUFFER;
}

// -- Grades -------------------------------------------------------------------
export const G_LATE = 0;
export const G_GOOD = 1;
export const G_QUICK = 2;
export const G_CRIT = 3;
export const QUICK_FRAC = 0.35;
export const GOOD_FRAC = 0.8;
/** A tap this close before emerge still counts (and grades QUICK). */
export const EARLY_GRACE_MS = 80;

// -- Beat grid -------------------------------------------------------------------
/** Beat-tracked from Chris's track-1 loop edit (mus_whack_main, 129.199 BPM). */
export const BURST_BPM = 129.199;
export const EIGHTH_MS = 60000 / BURST_BPM / 2;
export function quantize(ms: number): number {
  return Math.round(Math.round(ms / EIGHTH_MS) * EIGHTH_MS);
}

// -- Scoring (5.5) ---------------------------------------------------------------
export const PTS_FINN = [60, 100, 150];
export const PTS_TENTACLE = 50;
export const PTS_SPRINTER = 200;
export const PTS_HELMET_POP = 100;
export const PTS_PUFFER_POKE = 80;
export const PTS_BRUISER_HIT = 100;
export const PTS_BRUISER_KO = 300;
export const PTS_GOLDEN = 500;
export const PTS_DOUBLE = 200;
export const PTS_CRIT = 250;
export const PTS_ANGLER = -150;
export const PTS_COIN_BUBBLE = 50;
export const PTS_BOSS_DEFEAT = 1500;
export const PTS_LAP_PER_SEC = 100;
export const MULT_CAP = 6;
export const TIER_AT = [0, 5, 12, 20, 30];
export const TIER_MULT = [1, 1.5, 2, 2.5, 3];
export const TIER_COLORS = ['#ffffff', '#00a5f5', '#1fc8b8', '#fec90e', '#ff6b5c'];

// Bonk Meter (queue formats), percent.
export const METER_BY_GRADE = [3, 6, 10];
export const METER_GOLDEN = 35;
export const METER_DOUBLE = 8;
export const METER_CRIT = 5;
export const METER_SPRINTER = 12;
export const METER_ANGLER = -8;
export const METER_BUTTER = -10;
export const FEVER_MS = 7000;

// Ride Coin Meter (5.3), percent. Tuned with the autoplayer (tools/tests/whack-tune.cjs):
// the design's 8%-per-GOOD filled in about 11s, so every gain is scaled to 3/4 and the
// win line reads 17 GOODs. Median fill is about 18.5s and 3 stars (<= 18s) go to
// about 12-22% of median runs, 73% of expert runs.
export const COIN_BY_GRADE = [4.5,6,7.5];
export const COIN_GOLDEN = 15;
export const COIN_BRUISER = 5;
export const COIN_ANGLER = -8;
export const COIN_ESCAPE = -3;
export const COIN_BUTTER = -10;
/** 100% / GOOD (6%) = 17 clean GOODs; the meter is drawn as 17 notches. */
export const RIDE_WIN_NOTCHES = 17;

// Boss (5.6)
export const BOSS_HP: Record<Difficulty, number> = { 1: 16, 2: 20, 3: 24 };
export const BOSS_CADENCE: Record<Difficulty, number> = { 1: 3400, 2: 2800, 3: 2300 };
export const BRUISER_HP = 6;

// Walk-safe rules (4.3, 4.4)
export const LOOKUP_IDLE_MS = 1200;
export const LOOKUP_FRAC = 0.8;
export const ENGAGED_MS = 1200;
export const BUTTER_WHIFFS = 3;
export const BUTTER_WINDOW_MS = 1000;
export const ANGLER_LOCK_MS = 400;
export const TWIN_WINDOW_MS = 400;
export const REBONK_IGNORE_MS = 350;
export const MAX_TAPS = 400;

// Walk Charge (5.10)
export const WALK_PCT_PER_M = 2.5;
export const WALK_FULL_M = 40;

// -- Unlock ladder (5.4), by lifetime Burst number (1-based) ---------------------
export const UNLOCK = {
  angler: 2,
  golden: 3,
  butterfingers: 3,
  formations: 4,
  fever: 5,
  helmet: 6,
  twins: 7,
  sprinter: 8,
  allFormations: 9,
  boss: 10,
  puffer: 20,
} as const;

export const FIRST_CALLOUT: Record<number, string> = {
  1: "BONK 'EM BEFORE THE RING CLOSES",
  2: "DON'T BONK THE LURE",
  3: 'GOLDEN FINN! BONK IT FAST',
  4: 'FOLLOW THE PATH',
  5: 'FILL THE METER FOR FEVER',
  6: 'BONK TWICE: HELMET FIRST',
  7: 'BONK BOTH TWINS TOGETHER',
  8: 'SPRINTERS ARE QUICK',
  10: 'BOSS BURST! SWIPE THE INK',
  20: 'POKE THE PUFFER BEFORE IT PUFFS',
};

// -- Burst shapes -------------------------------------------------------------------
export type BurstShapeId = 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'rush' | 'ride' | 'raid';

export interface BurstShape {
  id: BurstShapeId;
  lengthMs: number;
  banner: string;
  /** First free spawn (ms). */
  startMs: number;
  gapFrom: number;
  gapTo: number;
  maxUpFrom: number;
  maxUpTo: number;
  /** Chance a free spawn is an angler (if unlocked). */
  angler: number;
  /** Chance a free spawn is a helmet Finn (if unlocked). */
  helmet: number;
  /** Chance a free spawn is a tentacle (boss Bursts). */
  tentacle: number;
  /** Golden windows [from, to] ms (if unlocked). */
  goldens: [number, number][];
  /** Formation slot start times (ms). */
  formations: number[];
  /** Trickster slots (ms), filled from the unlocked trickster set. */
  tricksters: number[];
  boss: boolean;
}

export const SHAPES: Record<BurstShapeId, BurstShape> = {
  b1: { id: 'b1', lengthMs: 12000, banner: "BONK 'EM!", startMs: 600, gapFrom: 900, gapTo: 760, maxUpFrom: 2, maxUpTo: 2,
    angler: 0, helmet: 0, tentacle: 0, goldens: [], formations: [7000], tricksters: [], boss: false },
  b2: { id: 'b2', lengthMs: 13000, banner: "DON'T BONK THE LURE", startMs: 600, gapFrom: 800, gapTo: 680, maxUpFrom: 2, maxUpTo: 3,
    angler: 0.25, helmet: 0, tentacle: 0, goldens: [[5000, 9000]], formations: [], tricksters: [], boss: false },
  b3: { id: 'b3', lengthMs: 13000, banner: 'PATTERN PARTY', startMs: 600, gapFrom: 720, gapTo: 600, maxUpFrom: 3, maxUpTo: 3,
    angler: 0.2, helmet: 0.2, tentacle: 0, goldens: [], formations: [2400, 6000, 9600], tricksters: [], boss: false },
  b4: { id: 'b4', lengthMs: 13000, banner: 'TRICKSTERS', startMs: 600, gapFrom: 640, gapTo: 520, maxUpFrom: 3, maxUpTo: 3,
    angler: 0.3, helmet: 0.1, tentacle: 0, goldens: [[6000, 8000]], formations: [], tricksters: [3000, 9200], boss: false },
  b5: { id: 'b5', lengthMs: 18000, banner: 'BOSS BURST', startMs: 1600, gapFrom: 600, gapTo: 480, maxUpFrom: 3, maxUpTo: 3,
    angler: 0.15, helmet: 0, tentacle: 0.55, goldens: [[8000, 11000]], formations: [], tricksters: [], boss: true },
  rush: { id: 'rush', lengthMs: 15000, banner: 'GOLDEN RUSH', startMs: 600, gapFrom: 640, gapTo: 540, maxUpFrom: 2, maxUpTo: 3,
    angler: 0.2, helmet: 0, tentacle: 0, goldens: [[2600, 4000], [9000, 12000]], formations: [], tricksters: [], boss: false },
  ride: { id: 'ride', lengthMs: 30000, banner: '17 BONKS TO WIN', startMs: 600, gapFrom: 1350, gapTo: 1100, maxUpFrom: 2, maxUpTo: 3,
    angler: 0.25, helmet: 0, tentacle: 0, goldens: [[10000, 14000]], formations: [17000, 21000], tricksters: [], boss: false },
  raid: { id: 'raid', lengthMs: 18000, banner: 'CREW RAID', startMs: 1600, gapFrom: 600, gapTo: 480, maxUpFrom: 3, maxUpTo: 3,
    angler: 0.15, helmet: 0, tentacle: 0.6, goldens: [[8000, 11000]], formations: [], tricksters: [], boss: true },
};

/** Ride segments (5.3): anglers from 8s, formations 16-24s, Bruiser 24-30s. */
export const RIDE_ANGLER_FROM = 5000;
export const RIDE_BRUISER_FROM = 24000;
export const RIDE_BRUISER_EVERY = 1500;

/** Difficulty scales the gaps (d2 is the table). */
export const GAP_SCALE: Record<Difficulty, number> = { 1: 1.12, 2: 1, 3: 0.9 };

/** Queue Run: 5 Bursts; daily 3; duel 3 (B2/B3/B4 shapes at 15s); raid 1. */
export function burstCount(format: WhackFormat): number {
  if (format === 'ride' || format === 'raid') return 1;
  if (format === 'daily' || format === 'duel') return 3;
  return 5;
}

/** Star thresholds for a whole Queue Run (sum of banked Bursts), per difficulty. */
export const RUN_STARS: Record<Difficulty, { one: number; two: number; three: number }> = {
  1: { one: 7500, two: 17000, three: 29000 },
  2: { one: 9000, two: 20000, three: 34000 },
  3: { one: 10000, two: 23000, three: 39000 },
};
/** Ride stars by time to 100% (ms). */
export const RIDE_STAR_MS = { three: 18000, two: 24000 };
