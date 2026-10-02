/**
 * waves.ts: Bonk Rush tuning tables (design v4: studio/design/whack.md, sections 5-6).
 *
 * Pure data. Everything a designer tunes lives here: target kinds, tells,
 * up-times, Burst shapes per format, the unlock ladder, scoring and meters.
 * The timeline (timeline.ts) and the resolver (sim.ts) read these tables, and
 * the PHP replay port mirrors them one to one (vectors in __vectors__/).
 */

export type Difficulty = 1 | 2 | 3;
/**
 * 'party' is the live Line Party round (Whack Rush): one 20s Burst, same seed for every seat, no Auto Look-Up.
 * 'lineDay' is Line of the Day (v4 12.2): everyone in this ride's line today on one seed, normalized roster.
 * 'weekly' is the v3 Weekly Ride Seed, kept only as an alias of a normalized shared-seed Run.
 */
export type WhackFormat = 'ride' | 'queue' | 'lineDay' | 'daily' | 'weekly' | 'duel' | 'raid' | 'party';

// -- Target kinds (ints: they live in UI-thread structs and proof vectors) ----
export const K_FINN = 0;
export const K_GOLDEN = 1;
export const K_ANGLER = 2;
export const K_HELMET = 3;
export const K_TWIN = 4;
export const K_SPRINTER = 5;
/** Sprinter and Puffer were cut in v4 (6.10). Their ids stay reserved so old vectors stay readable; nothing spawns them. */
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

/** Decoys: hitting them costs you; they never freeze the board, and their escapes never count. */
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
/**
 * Pre-emerge window (5.2): a tap from 80ms before emerge up to emerge is a QUICK
 * with the `anticipated` flag (reaction recorded as 0). Earlier is a whiff.
 */
export const EARLY_GRACE_MS = 80;

// -- Beat grid -------------------------------------------------------------------
/** Beat-tracked from Chris's track-1 loop edit (mus_whack_main, 129.199 BPM). */
export const BURST_BPM = 129.199;
export const EIGHTH_MS = 60000 / BURST_BPM / 2;
export const SIXTEENTH_MS = EIGHTH_MS / 2;
/** Nearest 8th-note slot (v4: emerges land on it, the tell phrase is the pickup). */
export function quantize(ms: number): number {
  return Math.round(Math.round(ms / EIGHTH_MS) * EIGHTH_MS);
}
/** Nearest 16th-note slot (the Golden Rush finale's last 3s). */
export function quantize16(ms: number): number {
  return Math.round(Math.round(ms / SIXTEENTH_MS) * SIXTEENTH_MS);
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
/** v4 skill spread (6.5): an x4 tier at streak 45, fever x2, effective cap x8. */
export const MULT_CAP = 8;
export const TIER_AT = [0, 5, 12, 20, 30, 45];
export const TIER_MULT = [1, 1.5, 2, 2.5, 3, 4];
export const TIER_COLORS = ['#ffffff', '#00a5f5', '#1fc8b8', '#fec90e', '#ff6b5c', '#ff9f1c'];
/** Engaged escapes at or above this tier (x2) drop exactly one tier; below it they reset the streak. */
export const TIER_DROP_FROM = 2;

// Bonk Meter (queue formats), percent.
export const METER_BY_GRADE = [3, 6, 10];
export const METER_GOLDEN = 35;
export const METER_DOUBLE = 8;
export const METER_CRIT = 5;
export const METER_SPRINTER = 12;
export const METER_ANGLER = -8;
export const METER_BUTTER = -10;
export const FEVER_MS = 7000;

// Ride Coin Meter (6.3), percent: QUICK +10, GOOD +8, LATE +6, golden +20, Bruiser +8.
// The round is paced (gaps, U) so the 13-notch line fills in about 18-20s for a
// median player (tools/tests/whack-tune.cjs).
export const COIN_BY_GRADE = [6, 8, 10];
export const COIN_GOLDEN = 20;
export const COIN_BRUISER = 8;
export const COIN_ANGLER = -8;
export const COIN_ESCAPE = -3;
export const COIN_BUTTER = -10;
/** "13 BONKS TO WIN": 100% / GOOD (8%) rounds up to 13 notches. */
export const RIDE_WIN_NOTCHES = 13;

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

// Walk Boost (6.12): +2.5% per meter, full at 40m, Golden Start only, random-seed solo Runs only.
export const WALK_PCT_PER_M = 2.5;
export const WALK_FULL_M = 40;
export const WALK_BOOST_EVERY = 3;

// -- Unlock ladder v5 (6.13), by lifetime Burst number (1-based) ----------------
export interface UnlockLadder {
  angler: number;
  golden: number;
  butterfingers: number;
  formations: number;
  fever: number;
  /** Ripe Golden and the PERFECT pip (v5 only; Infinity under v4 rules). */
  ripe: number;
  helmet: number;
  twins: number;
  /** Theme mutators (Wave 2) and the full formation pool. */
  allFormations: number;
  boss: number;
}
export const UNLOCK: UnlockLadder = {
  angler: 2,
  golden: 3,
  butterfingers: 3,
  formations: 4,
  fever: 5,
  ripe: 6,
  helmet: 7,
  twins: 8,
  allFormations: 9,
  boss: 11,
};
/** The v4 ladder, kept so v4 proofs replay exactly (13.1: the server keeps accepting v4). */
export const UNLOCK_V4: UnlockLadder = {
  angler: 2,
  golden: 3,
  butterfingers: 3,
  formations: 4,
  fever: 5,
  ripe: Infinity,
  helmet: 6,
  twins: 7,
  allFormations: 8,
  boss: 10,
};
/** Resolver rules version: 5 is current; 4 replays v4 proofs. */
export type RulesVersion = 4 | 5;
export function unlockFor(rules: RulesVersion): UnlockLadder {
  return rules === 4 ? UNLOCK_V4 : UNLOCK;
}

/** Shared-seed formats play this normalized lifetime (everything in the ship cut, never a first encounter). */
export const NORMALIZED_LIFETIME = 9;

export const FIRST_CALLOUT_V4: Record<number, string> = {
  1: 'HIT IT BEFORE THE RING CLOSES',
  2: 'WATCH THE TEETH',
  3: 'GOLDEN FINN! BONK IT FAST',
  4: 'FOLLOW THE PATH',
  5: 'FILL THE METER, THEN GO FEVER',
  6: 'BONK TWICE: HELMET FIRST',
  7: 'BONK BOTH TWINS TOGETHER',
  10: 'BOSS RUN! SWIPE THE INK',
};
/** v5 first encounters (6.13). */
export const FIRST_CALLOUT: Record<number, string> = {
  1: 'HIT IT BEFORE THE RING CLOSES',
  2: 'WATCH THE TEETH',
  3: 'GOLDEN FINN! BONK IT FAST',
  4: 'FOLLOW THE PATH',
  5: 'FILL THE METER, THEN GO FEVER',
  6: 'LET IT RIPEN... IF YOU DARE',
  7: 'BONK TWICE: HELMET FIRST',
  8: 'BONK BOTH TWINS TOGETHER',
  11: 'BOSS RUN! SWIPE THE INK',
};

// -- Ripe Golden (v5 6.4): the reason to wait ------------------------------------
/** U_g = 1.6 x the golden's up time (1740/1500/1280 ms by difficulty). */
export const RIPE_UP_MULT = 1.6;
export function ripeUpMs(d: Difficulty): number {
  return Math.round(UP_SPECIAL[d] * RIPE_UP_MULT);
}
/** Stage boundaries as fractions of U_g, and the flat value of each stage. */
export const RIPE_STAGE_AT = [0, 0.35, 0.65];
export const RIPE_VALUE = [300, 500, 800];
/** Seeded bolt: emergeAt + U_g x (0.72 + 0.20 x hash01). The first one ever bolts at 0.92. */
export const RIPE_BOLT_FROM = 0.72;
export const RIPE_BOLT_SPAN = 0.2;
export const RIPE_FIRST_BOLT = 0.92;

// -- PERFECT (v5 5.2) ----------------------------------------------------------------
/**
 * A QUICK within +-15 ms of a 16th slot: +20 flat (never multiplied), two ladder steps.
 * The design says +-35 ms, but +-35 of a 116 ms grid is 60% of all phases, so a
 * reaction-only player would earn it 60% of the time; +-15 gives the designed
 * 20-35% for reaction players and 60%+ for on-beat players (acceptance #13).
 */
export const PERFECT_WINDOW_MS = 15;
export const PTS_PERFECT = 20;

// -- Look-up (v5 5.4) ------------------------------------------------------------------
/** A freeze that starts at this tier (x2.5) or higher drops one tier on resume. */
export const LOOKUP_TIER_COST_FROM = 3;
/** Emerges inside this window after a resume ease in on their own hole clock (0.5x -> 1x). */
export const RESUME_EASE_MS = 600;
/** Up-time a post-resume emerge gains from the 0.5x -> 1x ease (pure function of the gap d, ms). */
export function resumeEaseExtension(d: number): number {
  'worklet';
  if (d < 0 || d >= RESUME_EASE_MS) return 0;
  const r = RESUME_EASE_MS - d;
  return Math.round((r * r) / (4 * RESUME_EASE_MS));
}

// -- Burst shapes (v4 6.2) ------------------------------------------------------------
export type BurstShapeId = 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'rush' | 'ride' | 'raid' | 'party';

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
  /** Twin pair slots (ms), once twins unlock. */
  tricksters: number[];
  /** Last ms of the Burst played on the 16th grid (Golden Rush finale). */
  sixteenthsFrom?: number;
  boss: boolean;
}

export const SHAPES: Record<BurstShapeId, BurstShape> = {
  b1: { id: 'b1', lengthMs: 12000, banner: "BONK 'EM!", startMs: 600, gapFrom: 900, gapTo: 760, maxUpFrom: 2, maxUpTo: 2,
    angler: 0, helmet: 0, tentacle: 0, goldens: [], formations: [7000], tricksters: [], boss: false },
  b2: { id: 'b2', lengthMs: 13000, banner: "DON'T BONK THE LURE", startMs: 600, gapFrom: 800, gapTo: 680, maxUpFrom: 2, maxUpTo: 3,
    angler: 0.25, helmet: 0.12, tentacle: 0, goldens: [[5000, 9000]], formations: [], tricksters: [], boss: false },
  // B3: the theme mutator's two slots (Wave 2); until then PATTERN PARTY: formations and twins.
  b3: { id: 'b3', lengthMs: 14000, banner: 'PATTERN PARTY', startMs: 600, gapFrom: 720, gapTo: 600, maxUpFrom: 3, maxUpTo: 3,
    angler: 0.2, helmet: 0.15, tentacle: 0, goldens: [], formations: [2400, 7600], tricksters: [5200, 11000], boss: false },
  // Duel middle Burst (15s): a trickier mix, no finale.
  b4: { id: 'b4', lengthMs: 15000, banner: 'TWIN TROUBLE', startMs: 600, gapFrom: 660, gapTo: 540, maxUpFrom: 3, maxUpTo: 3,
    angler: 0.3, helmet: 0.1, tentacle: 0, goldens: [[6000, 8000]], formations: [], tricksters: [3000, 9200], boss: false },
  // Boss Run finale (18s): every 3rd Run of the park day from lifetime Burst 10.
  b5: { id: 'b5', lengthMs: 18000, banner: 'BOSS RUN', startMs: 1600, gapFrom: 600, gapTo: 480, maxUpFrom: 3, maxUpTo: 3,
    angler: 0.15, helmet: 0, tentacle: 0.55, goldens: [[8000, 11000]], formations: [], tricksters: [], boss: true },
  // Golden Rush finale (16s): anglers 30%, 2 goldens, a 16th-note final 3s.
  rush: { id: 'rush', lengthMs: 16000, banner: 'GOLDEN RUSH', startMs: 600, gapFrom: 640, gapTo: 520, maxUpFrom: 3, maxUpTo: 3,
    angler: 0.3, helmet: 0.1, tentacle: 0, goldens: [[3000, 5000], [9000, 11500]], formations: [], tricksters: [], sixteenthsFrom: 13000, boss: false },
  ride: { id: 'ride', lengthMs: 30000, banner: '13 BONKS TO WIN', startMs: 600, gapFrom: 1800, gapTo: 1500, maxUpFrom: 2, maxUpTo: 3,
    angler: 0.25, helmet: 0, tentacle: 0, goldens: [[10000, 14000]], formations: [18500, 21500], tricksters: [], boss: false },
  // Line Party live round: a 20s mixtape of everything a regular knows (no boss),
  // two goldens and a late twin pair so a comeback is always possible.
  party: { id: 'party', lengthMs: 20000, banner: 'WHACK RUSH', startMs: 600, gapFrom: 780, gapTo: 540, maxUpFrom: 2, maxUpTo: 3,
    angler: 0.22, helmet: 0.12, tentacle: 0, goldens: [[5500, 8500], [13500, 16500]], formations: [3600, 10800], tricksters: [16800], boss: false },
  raid: { id: 'raid', lengthMs: 18000, banner: 'CREW RAID', startMs: 1600, gapFrom: 600, gapTo: 480, maxUpFrom: 3, maxUpTo: 3,
    angler: 0.15, helmet: 0, tentacle: 0.6, goldens: [[8000, 11000]], formations: [], tricksters: [], boss: true },
};

/** Ride segments (5.3): anglers from 8s, formations 16-24s, Bruiser 24-30s. */
export const RIDE_ANGLER_FROM = 5000;
export const RIDE_BRUISER_FROM = 24000;
export const RIDE_BRUISER_EVERY = 1500;

/** Difficulty scales the gaps (d2 is the table). */
export const GAP_SCALE: Record<Difficulty, number> = { 1: 1.12, 2: 1, 3: 0.9 };

/** Queue Run and Line of the Day: 4 Bursts (v4); daily 3; duel 3 (B2/B4/B3 at 15s); ride, raid, party 1. */
export function burstCount(format: WhackFormat): number {
  if (format === 'ride' || format === 'raid' || format === 'party') return 1;
  if (format === 'daily' || format === 'duel') return 3;
  return 4;
}

/** Formats with breathers bank fever (GO FEVER); one-Burst live/raid rounds fire it automatically. */
export function feverBanked(format: WhackFormat): boolean {
  return format !== 'party' && format !== 'raid' && format !== 'ride';
}

/**
 * Boss Run cadence (6.2): every 3rd Run of the park day, random-seed Queue Runs
 * only. v4: from lifetime Burst 10. v5: from lifetime Burst 11 and only with the
 * Wave 2 flag (`bossRuns`, MiniGameTester); Wave 1 ships Golden Rush only.
 */
export function isBossRun(format: WhackFormat, runOfDay: number, lifetimeAtFinale: number, rules: RulesVersion = 5, bossRuns = false): boolean {
  if (rules === 5 && !bossRuns) return false;
  return format === 'queue' && lifetimeAtFinale >= unlockFor(rules).boss && ((runOfDay | 0) % 3) === 2;
}

/** Star thresholds for a whole Queue Run (sum of banked Bursts), per difficulty (tools/tests/whack-tune.cjs). */
export const RUN_STARS: Record<Difficulty, { one: number; two: number; three: number }> = {
  1: { one: 7000, two: 18000, three: 30000 },
  2: { one: 8000, two: 20000, three: 33000 },
  3: { one: 9000, two: 22000, three: 37000 },
};
/** Ride stars by time to 100% (ms). */
export const RIDE_STAR_MS = { three: 18000, two: 24000 };
