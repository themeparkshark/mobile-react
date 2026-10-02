/**
 * Sharky Swim "Tide Run": the deterministic integer sim (design v7.1, tide-run-5).
 *
 * ONE file, self-contained (no imports), every function a worklet. The same
 * code runs on the UI thread (Reanimated), in `node --test`, in the ghost /
 * rival sims, and in the server's Node verifier (tools/sharky/build-verifier).
 *
 * Rules that keep it replayable bit-for-bit across Hermes and V8:
 *   - integer math only (Q8 fixed point for y, vy, speed, distance); products
 *     stay far below 2^53, divisions go through idiv (truncate);
 *   - no Math.sin / sqrt / random: a Bhaskara integer sine and mulberry32;
 *   - input is a log of (step, kind, arg); nothing reads wall time.
 *
 * Coordinates: world units (u). The fixed view is 720 x 1000u on every device
 * (design 3.2). The shark's world x is `dist`; entities carry absolute world x.
 *
 * v7.1 in one paragraph: one input (hold to rise), graze halos that pay per
 * step and credit a Skim or Close Skim at pass end, one chain that feeds a
 * Frenzy (x8, banks immediately), a Boost meter that arms an automatic
 * Overdrive on the next Close Skim or Perfect ring, Neutral Settle and soft
 * edges for glance-aways, a hit that costs a heart and a recoverable Coin
 * Scatter and nothing else, a flat tide clock (+4s per gate), a Gate Bonus
 * that cashes the chain, and a pocket that collapses when you hold through it.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SIM_VERSION_TAG = 'tide-run-5';
export const STEP_HZ = 60;
export const VIEW_W = 720;
export const VIEW_H = 1000;
export const SURFACE_Y = 40;
export const FLOOR_Y = 960;
export const Q = 256;

export const MODE_QUEUE = 0;
export const MODE_RIDE = 1;
export const MODE_RALLY = 2;
export const MODE_GHOST = 3;
export const MODE_PRACTICE = 4;
export const MODE_NAMES = ['queue', 'ride', 'rally', 'ghost', 'practice'];

export const PH_PLAY = 0;
export const PH_POCKET = 1;
export const PH_WIPE = 2;
export const PH_DONE = 3;

export const END_NONE = 0;
export const END_TIME = 1;
export const END_WIPEOUT = 2;
export const END_GATE = 3; // ride: reached the Ride Gate (win)
export const END_FINISH = 4; // rally: crossed the finish
export const END_ABORT = 5;

// Input kinds (log format: varint(stepDelta << 2 | kind)).
export const IN_PRESS = 0;
export const IN_RELEASE = 1;
/** Reserved (was the v6 Dash and the Rally Boost button, both cut in v7.1). Ignored. */
export const IN_RESERVED = 2;
export const IN_EXT = 3;
// Ext subkinds (design 12.2).
export const EXT_PAUSE_RESUME = 1;
export const EXT_CREW_FRENZY = 2;
export const EXT_RESCUE_SPAWN = 3;
export const EXT_REVIVE = 4;
export const EXT_LINE_BOOST = 5;
export const EXT_DRAFT_ON = 6;
export const EXT_DRAFT_OFF = 7;
export const EXT_RIDE_RESCUE = 8;
export const EXT_BUBBLE_GIFT = 10;

// Entity types.
export const E_NONE = 0;
export const E_COIN = 1;
export const E_RING = 2;
export const E_TOKEN = 3;
export const E_BOX = 4;
export const E_PYLON = 5;
export const E_JELLY = 6;
export const E_PUFFER = 7;
export const E_TORPEDO = 8;
export const E_SCATTER = 9;
export const E_GATE = 10;
export const E_SHIELD = 11;
export const E_GIFT = 12;

// Entity flags.
export const F_PASS = 1; // a graze pass is open (shark inside the halo)
export const F_SMASH = 2; // smashed in Overdrive
export const F_DONE = 4; // collected / resolved / passed
export const F_HIT = 8; // hit the shark
export const F_SKIMMED = 16; // Skim credit already decided for this hazard
export const F_BADGE = 32; // edge badge fired
export const F_GHOST = 64; // phased (float) while overlapping
export const F_GATE_RING = 128; // the Gate Rush ring in an arch

// Coin flags (ep2): bit0 Close-line, bit1 bottom cap side, bits2-3 pylon class,
// bit4 circle hug, bit5 Bubble Gift coin, bit6 Gate Rush coin.
export const CF_CLOSE = 1;
export const CF_GIFT = 32;
export const CF_RUSH = 64;

// Gate kinds.
export const G_TIDE = 0;
export const G_RIDE = 1;
export const G_SPLIT = 2;
export const G_FINISH = 3;

// Events (sim -> presentation). Stride EV_STRIDE: kind, a, b, c, d.
export const EV_STRIDE = 5;
export const EV_CAP = 48;
export const EV_COIN = 1; // x, y, ladder, flags (1 regrab, 2 star, 4 close-line, 8 rush, 16 gift)
export const EV_LINE = 2; // x, y, count, 0
export const EV_RING = 3; // x, y, perfect, gap
export const EV_SKIM = 4; // x, y, close, entity
export const EV_CHOMP = 5; // x, y, kind, pts (kind E_PYLON/E_JELLY/E_TORPEDO = Overdrive smash)
export const EV_TOKEN = 6;
export const EV_TOKEN_SET = 7;
export const EV_BOOST_SEG = 8; // segments 1..3
export const EV_OD_ARMED = 9;
export const EV_OD_START = 10; // x, y, trigger (1 close skim, 2 perfect)
export const EV_HIT = 11; // x, y, hearts, type
export const EV_SHIELD_POP = 12;
export const EV_CHAIN_TIER = 13; // tier, chain
export const EV_CHAIN_BREAK = 14; // tier, chain, reason (0 timeout, 3 wipeout, 4 surface, 5 floor)
export const EV_FRENZY_START = 15;
export const EV_FRENZY_END = 16;
export const EV_BOUNCE = 17; // which (0 surface, 1 floor), x
export const EV_GATE = 18; // bonusSteps, kind, step, gates
export const EV_POCKET_END = 19;
export const EV_PIP = 20; // n (3 = last), short
export const EV_BADGE = 21; // entity, type
export const EV_TORPEDO_TRACK = 22;
export const EV_TORPEDO_LOCK = 23;
export const EV_PUFFER_WIGGLE = 24;
export const EV_FLOAT_IN = 25;
export const EV_FLOAT_POP = 26;
export const EV_FREEZE = 27;
export const EV_DOOM = 28;
export const EV_WIPEOUT = 29;
export const EV_REVIVE = 30;
export const EV_END = 31;
export const EV_CLOCK_TICK = 32;
export const EV_SPRINT = 33;
export const EV_SCATTER = 34; // n, x, y, deducted
export const EV_SHIELD_GET = 35;
export const EV_LINE_BOOST = 36;
export const EV_OD_END = 37;
export const EV_REGRAB = 38; // x, y, count, refund
export const EV_SCORE = 39; // score
export const EV_DRAFT = 40;
export const EV_GATE_NEAR = 41;
export const EV_GRAZE = 42; // close, entity, hazard edge y, 0
export const EV_TOUCH = 43; // which (0 surface, 1 floor), x
export const EV_GATE_BONUS = 44; // pts, mult, frenzy, gateKind
export const EV_RUSH = 45; // gateX, gateKind
export const EV_GIFT_IN = 46; // eventId, x, y
export const EV_GIFT_POP = 47; // x, y, eventId
export const EV_SETTLE = 48; // y
export const EV_PASS = 49; // hazardType, speed (u/s): a hazard's centre passes the shark (Doppler)

// Shark geometry (u). v7.1: art and hitbox x1.2 (design 3.1).
export const SHARK_RX = 55;
export const SHARK_RY = 31;
export const SIL_RX = 72;
export const SIL_RY = 43;
export const SHARK_MIN_Y = SURFACE_Y + 34;
export const SHARK_MAX_Y = FLOOR_Y - 34;
/** The nose sits this far ahead of the shark centre (anchor + 90u). */
export const NOSE_OFF = 90;

// Hazard geometry (u).
export const PYLON_W = 120;
export const HIT_INSET = 10;
export const JELLY_R = 48;
export const JELLY_BOB = 60;
export const JELLY_PERIOD = 96;
export const PUFF_R0 = 28;
export const PUFF_R1 = 56;
export const PUFF_INFLATE_DX = 220;
export const PUFF_INFLATE_STEPS = 11;
export const TORP_W = 130;
export const TORP_H = 84;
export const TORP_TRACK = 36;
export const TORP_LOCK = 24;
export const COIN_R = 22;
export const BOX_R = 40;
export const TOKEN_R = 34;
export const RING_R = 70;
export const RING_PERFECT = 18;
export const SHIELD_R = 40;
/** Tide / Ride Gate arch art half-width at 60% (design 4.3), for the exclusion zone. */
export const ARCH_HALF = 332;
export const GATE_PAD_BEFORE = 300;
export const GATE_PAD_AFTER = 200;
export const ART_PAD = 40;

// Graze (design 3.3): bands in u from the silhouette to the art edge.
export const GRAZE_CLOSE = 14;
export const GRAZE_HALO = 28;
export const GRAZE_MIN_STEPS = 6;
export const GRAZE_PTS_CAP = 80;
export const GRAZE_BOOST_CAP = 50;

// Systems.
export const HEARTS = 3;
export const IFRAMES = 60;
export const BOOST_MAX = 300;
export const BOOST_SEG = 100;
export const OD_STEPS = 150;
export const OD_IFRAMES = 36;
export const CHAIN_WINDOW = 120;
export const FRENZY_STEPS = 360;
export const SCATTER_STEPS = 90;
export const SETTLE_IDLE = 36;
export const SETTLE_IDLE_EDGE = 9;
export const SETTLE_VMAX = 300;
export const SOFT_VY = 300;
export const FLOAT_ARM = 108;
export const FLOAT_IN = 24;
export const FLOAT_FREEZE = 360;
export const POP_GRACE = 18;
export const REVIVE_SHIELD = 120;
export const WIPE_ANIM = 54;
export const REVIVE_WINDOW = 180;
export const CLOCK_BASE = 1800; // 30s
export const CLOCK_CAP = 3600; // 60s total
export const GATE_CLOCK = 240; // +4s per Tide Gate, flat
export const POCKET_QUEUE = 150;
export const POCKET_RIDE = 120;
export const POCKET_SHORT = 48;
export const LINE_BOOST_STEPS = 60;
export const LINE_BOOST_MAX = 240;
export const DRAFT_MAX = 120;
export const GIFT_COOL = 300;
export const RALLY_LEN_HALF = 2000;

// ---------------------------------------------------------------------------
// Integer helpers
// ---------------------------------------------------------------------------

export function idiv(a: number, b: number): number {
  'worklet';
  const q = a / b;
  return q < 0 ? Math.ceil(q) : Math.floor(q);
}

function clampi(v: number, lo: number, hi: number): number {
  'worklet';
  return v < lo ? lo : v > hi ? hi : v;
}

function absi(v: number): number {
  'worklet';
  return v < 0 ? -v : v;
}

/**
 * Integer sine, Bhaskara I approximation. `p` is a phase in 1/1024 turns.
 * Returns Q8 (-256..256). Deterministic everywhere (no Math.sin).
 */
export function isin(p: number): number {
  'worklet';
  let t = p % 1024;
  if (t < 0) t += 1024;
  let sign = 1;
  if (t >= 512) {
    t -= 512;
    sign = -1;
  }
  // sin(x) ~ 16x(180-x) / (40500 - 4x(180-x)); x = t*180/512.
  const x = t * 180; // scaled by 512
  const a = x * (92160 - x); // (x)(180*512 - x), scaled by 512^2
  const num = 4 * a;
  const den = 40500 * 262144 - a;
  const r = sign * idiv(num * 256, den);
  return r === 0 ? 0 : r;
}

/** mulberry32 on a one-number state object. Returns uint32. */
export function rngNext(r: { s: number }): number {
  'worklet';
  r.s = (r.s + 0x6d2b79f5) | 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Integer in [lo, hi] inclusive. */
export function rngRange(r: { s: number }, lo: number, hi: number): number {
  'worklet';
  if (hi <= lo) return lo;
  return lo + (rngNext(r) % (hi - lo + 1));
}

/** 32-bit hash mix of two ints (sprint descriptor seeds, run seeds). */
export function hash2(a: number, b: number): number {
  'worklet';
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ b;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

export function fnv(h: number, v: number): number {
  'worklet';
  let x = h >>> 0;
  let n = v | 0;
  for (let i = 0; i < 4; i++) {
    x ^= n & 0xff;
    x = Math.imul(x, 16777619) >>> 0;
    n >>= 8;
  }
  return x >>> 0;
}

// ---------------------------------------------------------------------------
// Chunks (authored in tools/sharky/chunks-src.cjs). Entities: [type, x, y, p1, p2].
// ---------------------------------------------------------------------------

export interface Chunk {
  id: number;
  name: string;
  len: number;
  diff: number;
  zone: number;
  tier: number;
  breather: number;
  /** The lane (y) the chunk exits on: the Gate Rush coin line starts here. */
  exitY: number;
  e: number[];
}

// CHUNKS-BEGIN (generated by tools/sharky/chunks-src.cjs; edit the source, then run it)
export const CHUNKS: Chunk[] = [
  { id: 0, name: 'lagoon_warmup', len: 1035, diff: 1, zone: 0, tier: 0, breather: 1, exitY: 500,
    e: [
      1, 69, 520, 0, 0, 1, 139, 411, 0, 0, 1, 209, 357, 0, 0, 1, 279, 357, 0, 0,
      1, 349, 411, 0, 0, 1, 419, 520, 0, 0, 1, 541, 470, 1, 0, 1, 611, 590, 1, 0,
      1, 681, 630, 1, 0, 1, 751, 590, 1, 0, 1, 821, 470, 1, 0, 2, 943, 470, 0, 0,
    ] },
  { id: 1, name: 'pylon_pair', len: 1104, diff: 2, zone: 1, tier: 0, breather: 0, exitY: 640,
    e: [
      5, 92, 300, 0, 0, 1, 81, 161, 0, 1, 1, 151, 161, 0, 1, 1, 221, 161, 0, 1,
      5, 667, 690, 0, 0,
    ] },
  { id: 2, name: 'jelly_drift', len: 1104, diff: 2, zone: 1, tier: 0, breather: 0, exitY: 300,
    e: [
      6, 184, 300, 0, 0, 6, 529, 520, 512, 0, 2, 529, 270, 0, 0, 6, 897, 760, 256, 0,
    ] },
  { id: 3, name: 'ring_lane', len: 874, diff: 1, zone: 1, tier: 0, breather: 1, exitY: 330,
    e: [
      2, 92, 420, 0, 0, 2, 334, 360, 0, 0, 2, 575, 300, 0, 0, 1, 644, 300, 0, 0,
      1, 714, 330, 0, 0, 1, 784, 360, 0, 0,
    ] },
  { id: 4, name: 'pylon_slalom', len: 1150, diff: 4, zone: 2, tier: 0, breather: 0, exitY: 320,
    e: [
      5, 69, 300, 0, 0, 5, 575, 690, 0, 0, 1, 564, 551, 0, 1, 1, 634, 551, 0, 1,
      1, 704, 551, 0, 1, 3, 736, 870, 0, 0, 5, 1012, 320, 1, 0,
    ] },
  { id: 5, name: 'jelly_curtain', len: 1081, diff: 5, zone: 2, tier: 0, breather: 0, exitY: 700,
    e: [
      6, 299, 480, 0, 0, 6, 299, 620, 0, 0, 6, 299, 760, 0, 0, 6, 299, 900, 0, 0,
      2, 299, 250, 0, 0, 6, 805, 160, 512, 0, 6, 805, 520, 512, 0,
    ] },
  { id: 6, name: 'box_bounty', len: 1150, diff: 3, zone: 1, tier: 1, breather: 0, exitY: 680,
    e: [
      4, 115, 380, 0, 0, 5, 437, 290, 1, 0, 1, 425, 121, 0, 5, 1, 495, 121, 0, 5,
      1, 565, 121, 0, 5, 3, 782, 200, 0, 0, 5, 966, 700, 0, 0,
    ] },
  { id: 7, name: 'puffer_patrol', len: 1150, diff: 4, zone: 2, tier: 1, breather: 0, exitY: 300,
    e: [
      7, 207, 500, 0, 0, 1, 126, 421, 0, 17, 1, 196, 421, 0, 17, 1, 266, 421, 0, 17,
      7, 598, 320, 0, 0, 7, 633, 720, 0, 0, 3, 621, 880, 0, 0, 4, 966, 300, 0, 0,
    ] },
  { id: 8, name: 'puffer_pylon', len: 1150, diff: 6, zone: 2, tier: 1, breather: 0, exitY: 380,
    e: [
      5, 46, 300, 0, 0, 1, 35, 161, 0, 1, 1, 105, 161, 0, 1, 1, 175, 161, 0, 1,
      7, 437, 460, 0, 0, 5, 736, 690, 0, 0, 7, 1058, 380, 0, 0,
    ] },
  { id: 9, name: 'torpedo_alley', len: 1150, diff: 5, zone: 2, tier: 3, breather: 0, exitY: 700,
    e: [
      8, 437, 500, 0, 0, 5, 805, 690, 1, 0, 1, 793, 859, 0, 7, 1, 863, 859, 0, 7,
      1, 933, 859, 0, 7, 3, 1035, 240, 0, 0,
    ] },
  { id: 10, name: 'storm_mix', len: 1150, diff: 8, zone: 3, tier: 3, breather: 0, exitY: 860,
    e: [
      5, 46, 300, 0, 0, 1, 35, 439, 0, 3, 1, 105, 439, 0, 3, 1, 175, 439, 0, 3,
      6, 414, 700, 0, 0, 6, 448, 250, 512, 0, 8, 690, 500, 0, 0, 5, 943, 690, 0, 0,
    ] },
  { id: 11, name: 'gauntlet', len: 1150, diff: 9, zone: 3, tier: 1, breather: 0, exitY: 520,
    e: [
      5, 46, 300, 2, 0, 1, 35, 419, 0, 11, 1, 105, 419, 0, 11, 1, 175, 419, 0, 11,
      7, 414, 560, 0, 0, 6, 414, 860, 256, 0, 5, 690, 690, 2, 0, 6, 1012, 330, 0, 0,
    ] },
  { id: 12, name: 'shield_breather', len: 874, diff: 1, zone: 1, tier: 0, breather: 1, exitY: 520,
    e: [
      2, 92, 420, 0, 0, 11, 345, 500, 0, 0, 2, 575, 360, 0, 0, 1, 644, 380, 0, 0,
      1, 714, 450, 0, 0, 1, 784, 520, 0, 0,
    ] },
  { id: 13, name: 'reef_fork', len: 1150, diff: 4, zone: 2, tier: 0, breather: 0, exitY: 300,
    e: [
      5, 138, 700, 0, 0, 1, 126, 561, 0, 1, 1, 196, 561, 0, 1, 1, 266, 561, 0, 1,
      2, 207, 561, 0, 0, 6, 759, 520, 0, 0, 5, 759, 280, 1, 0,
    ] },
];
export const CHUNK_WARMUP = 0;
export const CHUNK_BREATHER = 3;
export const CHUNK_SHIELD = 12;
// CHUNKS-END

/** Minimum unlock tier for each entity type (design 5.9). */
export function entityTier(t: number): number {
  'worklet';
  if (t === E_BOX || t === E_TOKEN || t === E_PUFFER) return 1;
  if (t === E_TORPEDO) return 3;
  return 0;
}

// ---------------------------------------------------------------------------
// Config and descriptors
// ---------------------------------------------------------------------------

export interface SimConfig {
  seed: number;
  mode: number;
  /** 1..3 (queue); ride and rally use their own speed tables. */
  difficulty: number;
  /** Unlock tier = verified runs, capped at 12. */
  tier: number;
  /** Runs played so far (FRENZY_AT 10 for the first 3). */
  runs: number;
  /** Ride mode: a banked, earned Rescue Bubble is available. */
  rescues?: number;
}

export interface SprintDescriptor {
  sprintIdx: number;
  /** Chunk ids; -1 marks the Rally split gate. */
  chunks: number[];
  remix: number;
  sig?: string;
}

/** Speed table (u/s): [base, cap] (design 3.2). */
export function speedTable(mode: number, diff: number): number[] {
  'worklet';
  if (mode === MODE_RIDE) return [320, 450];
  if (mode === MODE_RALLY) return [400, 460];
  if (diff <= 1) return [300, 440];
  if (diff >= 3) return [370, 520];
  return [340, 480];
}

/** Effective hazard tier for a mode (design 5.9 fairness). */
export function effectiveTier(mode: number, tier: number): number {
  'worklet';
  if (mode === MODE_RALLY) return 3;
  if (mode === MODE_RIDE) return clampi(tier, 2, 4);
  return clampi(tier, 0, 12);
}

export function pylonGap(diff: number, cls: number): number {
  'worklet';
  const base = diff <= 1 ? 440 : diff >= 3 ? 320 : 380;
  return cls === 1 ? base + 60 : cls === 2 ? base - 40 : base;
}

/** The authoring gap (D2) a Close-line coin was placed against. */
function authorGap(cls: number): number {
  'worklet';
  return cls === 1 ? 440 : cls === 2 ? 340 : 380;
}

/** Hazard-free Gate Rush length before a gate (u): 2.5s at +12%. */
export function rushLen(speedU: number): number {
  'worklet';
  return idiv(speedU * 28, 10);
}

/** Is this a timed (tide clock) mode? */
export function timedMode(mode: number): boolean {
  'worklet';
  return mode === MODE_QUEUE || mode === MODE_GHOST || mode === MODE_PRACTICE;
}

/** Chunk content length per sprint (u), before the Gate Rush. */
export function sprintTargetLen(mode: number, sprintIdx: number, speedU: number): number {
  'worklet';
  if (mode === MODE_RIDE) return 3800;
  if (mode === MODE_RALLY) return RALLY_LEN_HALF;
  // Queue sprints 1-3: about 8.5s of chunks plus a 2.5s rush = 11s.
  // Sprint 4 (Final Stretch) has no gate: enough course for any clock.
  if (sprintIdx >= 3) return clampi(speedU * 40, 12000, 22000);
  return clampi(idiv(speedU * 85, 10), 2500, 4800);
}

function diffBand(mode: number, sprintIdx: number): number[] {
  'worklet';
  if (mode === MODE_RIDE) {
    if (sprintIdx === 0) return [2, 4];
    if (sprintIdx === 1) return [3, 6];
    return [5, 7];
  }
  if (mode === MODE_RALLY) return [3, 8];
  if (sprintIdx === 0) return [2, 4];
  if (sprintIdx === 1) return [4, 7];
  if (sprintIdx === 2) return [6, 9];
  return [7, 10];
}

/** Does a sprint end in a gate? (Queue sprint 4 is the gateless Final Stretch.) */
export function sprintHasGate(mode: number, sprintIdx: number): boolean {
  'worklet';
  if (timedMode(mode)) return sprintIdx < 3;
  return true;
}

function pickChunk(r: { s: number }, band: number[], t: number, last: number): number {
  'worklet';
  for (let widen = 0; widen < 10; widen++) {
    const lo = band[0] - widen;
    const hi = band[1] + widen;
    let count = 0;
    for (let i = 1; i < CHUNKS.length; i++) {
      const c = CHUNKS[i];
      if (c.breather || c.tier > t || c.id === last || c.diff < lo || c.diff > hi) continue;
      count++;
    }
    if (count === 0) continue;
    let k = rngRange(r, 0, count - 1);
    for (let i = 1; i < CHUNKS.length; i++) {
      const c = CHUNKS[i];
      if (c.breather || c.tier > t || c.id === last || c.diff < lo || c.diff > hi) continue;
      if (k === 0) return c.id;
      k--;
    }
  }
  return CHUNK_BREATHER;
}

/**
 * Sprint descriptor generator (design 4.4). Pure function of
 * (seed, sprintIdx, mode, tier, speed), so the server can stream the same
 * descriptors, and an offline client regenerates them identically.
 */
export function generateSprint(seed: number, sprintIdx: number, mode: number, tier: number, speedU: number): SprintDescriptor {
  'worklet';
  const r = { s: hash2(seed, sprintIdx + 1) | 0 };
  const t = effectiveTier(mode, tier);
  const band = diffBand(mode, sprintIdx);
  const target = sprintTargetLen(mode, sprintIdx, speedU);
  const chunks: number[] = [];
  let len = 0;
  let last = -1;
  let sinceBreather = 0;
  if (sprintIdx === 0 && mode !== MODE_RALLY) {
    chunks.push(CHUNK_WARMUP);
    len += CHUNKS[CHUNK_WARMUP].len;
  }
  const halves = mode === MODE_RALLY ? 2 : 1;
  for (let h = 0; h < halves; h++) {
    if (h === 1) {
      chunks.push(-1);
      len = 0;
      sinceBreather = 0;
    }
    let guard = 0;
    while (len < target - 300 && guard < 46) {
      guard++;
      if (mode === MODE_RIDE && sprintIdx === 1 && chunks.length === 1) {
        chunks.push(CHUNK_SHIELD);
        len += CHUNKS[CHUNK_SHIELD].len;
        sinceBreather = 0;
        last = CHUNK_SHIELD;
        continue;
      }
      if (sinceBreather >= 3) {
        chunks.push(CHUNK_BREATHER);
        len += CHUNKS[CHUNK_BREATHER].len;
        sinceBreather = 0;
        last = CHUNK_BREATHER;
        continue;
      }
      const pickId = pickChunk(r, band, t, last);
      // Stop rather than overshoot: the flat clock assumes 11s sprints.
      if (len >= target - 700 && len + CHUNKS[pickId].len > target + 250) break;
      chunks.push(pickId);
      len += CHUNKS[pickId].len;
      last = pickId;
      sinceBreather++;
    }
  }
  return { sprintIdx, chunks, remix: 0 };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export const ENT_CAP = 160;
export const LINE_CAP = 32;
export const CQ_CAP = 48;

export interface SimState {
  // config
  seed: number;
  mode: number;
  diff: number;
  tier: number;
  etier: number;
  runs: number;
  speedBase: number;
  speedCap: number;
  frenzyAt: number;
  // time
  step: number;
  worldT: number;
  activeSteps: number;
  speedSteps: number;
  phase: number;
  phaseSteps: number;
  pocketLen: number;
  clockSteps: number;
  bonusSteps: number;
  lineBoostSteps: number;
  // shark
  y: number;
  vy: number;
  py: number;
  holding: number;
  lastPress: number;
  /** Step of the last press or release (Settle and Float idle counts). */
  lastTouch: number;
  settle: number;
  touchCool: number;
  dist: number;
  pdist: number;
  speed: number;
  speedEff: number;
  gates: number;
  iframes: number;
  boost: number;
  odArmed: number;
  od: number;
  hearts: number;
  shield: number;
  reviveShield: number;
  reviveUsed: number;
  rescueUsed: number;
  rescueAvail: number;
  gateNear: number;
  float: number; // 0 none, 1 floating, 2 hover-freeze
  floatSteps: number;
  popGrace: number;
  pocketY: number;
  rushK: number;
  draft: number;
  draftSteps: number;
  draftAcc: number;
  doomCool: number;
  // scoring
  score: number;
  distAcc: number;
  chain: number;
  chainTimer: number;
  chainCoins: number;
  frenzy: number;
  frenzyCount: number;
  /** Chain count that starts the next Frenzy. */
  frenzyNext: number;
  tokens: number;
  tokenMask: number;
  skimStack: number;
  skimTimer: number;
  ladder: number;
  ladderTimer: number;
  maxChain: number;
  maxTier: number;
  regrabN: number;
  lastGateBonus: number;
  crowd: number;
  crowdAway: number;
  crowdOut: number;
  giftCool: number;
  /** Presentation: the strongest graze band this step (0 none, 1 halo, 2 Close) and its hazard. */
  grazeBand: number;
  grazeEnt: number;
  // course
  sprint: number;
  sprintStart: number;
  gateX: number;
  gateKind: number;
  rushX: number;
  courseEnd: number; // ride/rally total length (u), 0 = endless
  cq: number[];
  cqX: number[];
  cqN: number;
  cqNext: number;
  tokenPlaced: number;
  lineSeq: number;
  lineTotal: number[];
  lineGot: number[];
  lineId: number[];
  // entities (struct of arrays)
  et: number[];
  ex: number[];
  ey: number[];
  epx: number[];
  epy: number[];
  ep1: number[];
  ep2: number[];
  est: number[];
  etm: number[];
  evx: number[];
  evy: number[];
  ef: number[];
  eline: number[];
  /** Graze pass counters: halo steps, Close steps, base points paid, Boost paid. */
  eg: number[];
  ec: number[];
  egp: number[];
  egb: number[];
  /** Steps the silhouette overlapped the art (clipping) this pass. */
  eo: number[];
  eHint: number;
  // rng for in-run randomness (scatter fans)
  rs: number;
  // events
  ev: number[];
  evN: number;
  /** Events of the last step were drained: the next input or step starts a fresh batch. */
  evStale: number;
  // integrity
  hash: number;
  // stats (plausibility + results)
  stSkims: number;
  stCloseSkims: number;
  stHaloSteps: number;
  stCloseSteps: number;
  stPasses: number;
  stPerfects: number;
  stRings: number;
  stChomps: number;
  stSmashes: number;
  stHits: number;
  stCoins: number;
  stCoinsTotal: number;
  stOverdrives: number;
  stFrenzies: number;
  stBounces: number;
  stTouches: number;
  stRegrabs: number;
  stTele: number;
  stReactN: number;
  stReactSum: number;
  stReactFast: number;
  reactS: number[];
  lastTele: number;
  holdStart: number;
  holdHist: number[];
  stPerfectTight: number;
  stRingOpp: number;
  inputsSinceSkim: number;
  consecClose: number;
  maxConsecClose: number;
  splitSteps: number[];
  splitScores: number[];
  finishStep: number;
  endReason: number;
}

function zeros(n: number): number[] {
  'worklet';
  const a: number[] = [];
  for (let i = 0; i < n; i++) a.push(0);
  return a;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function emit(s: SimState, kind: number, a: number, b: number, c: number, d: number): void {
  'worklet';
  if (s.evStale) {
    // Inputs applied before a step emit into that step's batch.
    s.evN = 0;
    s.evStale = 0;
  }
  if (s.evN >= EV_CAP) return;
  const o = s.evN * EV_STRIDE;
  s.ev[o] = kind;
  s.ev[o + 1] = a;
  s.ev[o + 2] = b;
  s.ev[o + 3] = c;
  s.ev[o + 4] = d;
  s.evN++;
}

// ---------------------------------------------------------------------------
// Course
// ---------------------------------------------------------------------------

export function distU(s: SimState): number {
  'worklet';
  return s.dist >> 8;
}

/** Speed fraction Q8 (0..256) between base and cap. */
export function speedFrac(s: SimState): number {
  'worklet';
  const den = s.speedCap - s.speedBase;
  if (den <= 0) return 0;
  return clampi(idiv((s.speed - s.speedBase) * 256, den), 0, 256);
}

/** Shark anchor x in the view (u): 158 (22%) at base speed, 108 (15%) at max. */
export function anchorX(s: SimState): number {
  'worklet';
  return 158 - ((50 * speedFrac(s)) >> 8);
}

/** Course visible ahead of the shark centre (u). */
export function aheadU(s: SimState): number {
  'worklet';
  return VIEW_W - anchorX(s);
}

function allocEntity(s: SimState): number {
  'worklet';
  for (let k = 0; k < ENT_CAP; k++) {
    const i = (s.eHint + k) % ENT_CAP;
    if (s.et[i] === E_NONE) {
      s.eHint = (i + 1) % ENT_CAP;
      return i;
    }
  }
  return -1;
}

export function spawn(s: SimState, t: number, x: number, y: number, p1: number, p2: number, line: number): number {
  'worklet';
  const i = allocEntity(s);
  if (i < 0) return -1;
  s.et[i] = t;
  s.ex[i] = x;
  s.ey[i] = y;
  s.epx[i] = x;
  s.epy[i] = y;
  s.ep1[i] = p1;
  s.ep2[i] = p2;
  s.est[i] = 0;
  s.etm[i] = 0;
  s.evx[i] = 0;
  s.evy[i] = 0;
  s.ef[i] = 0;
  s.eline[i] = line;
  s.eg[i] = 0;
  s.ec[i] = 0;
  s.egp[i] = 0;
  s.egb[i] = 0;
  s.eo[i] = 0;
  return i;
}

/** A fresh coin-line slot (global ring of LINE_CAP). */
function newLine(s: SimState): number {
  'worklet';
  const g = s.lineSeq % LINE_CAP;
  s.lineSeq++;
  s.lineTotal[g] = 0;
  s.lineGot[g] = 0;
  s.lineId[g] = s.lineSeq;
  return g;
}

/**
 * Gate Rush (design 5.7): a hazard-free run-up with a 9-coin line at 55u
 * spacing from the exit lane into a Gate Ring centred in the arch.
 */
function spawnRush(s: SimState, gateX: number, exitY: number): void {
  'worklet';
  const ringX = gateX - 30;
  const g = newLine(s);
  const y0 = clampi(exitY, 200, 800);
  for (let k = 0; k < 9; k++) {
    const x = ringX - 80 - (8 - k) * 55;
    // Smoothstep from the exit lane to the arch centre (y 500).
    const tq = idiv(k * 256, 8);
    const ease = idiv(tq * tq * (768 - 2 * tq), 65536);
    const y = y0 + idiv((500 - y0) * ease, 256);
    s.lineTotal[g]++;
    spawn(s, E_COIN, x, y, 0, CF_RUSH, g);
  }
  const ri = spawn(s, E_RING, ringX, 500, 1, 0, 0);
  if (ri >= 0) s.ef[ri] |= F_GATE_RING;
}

/**
 * Start sprint `idx`: materialize its descriptor into the chunk queue. `desc`
 * may be a server-streamed descriptor; null regenerates locally.
 */
export function startSprint(s: SimState, idx: number, desc: SprintDescriptor | null, extraLead: number): void {
  'worklet';
  const d = desc || generateSprint(s.seed, idx, s.mode, s.tier, s.speed >> 8);
  s.sprint = idx;
  const du = distU(s);
  const sp = s.speed >> 8;
  // Lead-in: no hazard hitbox within ~1.5s of the pocket exit. At GO every
  // hazard must still get its full edge badge (600ms before the view).
  const lead = extraLead + (idx === 0 ? (s.mode === MODE_RALLY ? aheadU(s) + 320 : 260) : idiv(sp * 3, 2));
  let x = du + lead;
  s.sprintStart = x;
  s.cqN = 0;
  s.cqNext = 0;
  s.tokenPlaced = idx >= 3 || s.etier < 1 ? 1 : 0;
  const rl = rushLen(sp);
  let lastChunk = -1;
  for (let i = 0; i < d.chunks.length && s.cqN < CQ_CAP; i++) {
    const c = d.chunks[i];
    if (c < 0) {
      // Rally split: rush, split gate (no pocket), then a 1.5s lead-in.
      const gx = x + rl;
      spawnRush(s, gx, lastChunk >= 0 ? CHUNKS[lastChunk].exitY : 500);
      spawn(s, E_GATE, gx, 500, G_SPLIT, 0, 0);
      x = gx + (idiv(sp * 3, 2) > 640 ? idiv(sp * 3, 2) : 640);
      continue;
    }
    s.cq[s.cqN] = c;
    s.cqX[s.cqN] = x;
    x += CHUNKS[c].len;
    s.cqN++;
    lastChunk = c;
  }
  let kind = G_TIDE;
  if (s.mode === MODE_RIDE && idx >= 2) kind = G_RIDE;
  if (s.mode === MODE_RALLY) kind = G_FINISH;
  s.gateKind = kind;
  if (sprintHasGate(s.mode, idx)) {
    s.rushX = x;
    s.gateX = x + rl;
    spawnRush(s, s.gateX, lastChunk >= 0 ? CHUNKS[lastChunk].exitY : 500);
    spawn(s, E_GATE, s.gateX, 500, kind, 0, 0);
  } else {
    s.rushX = 0;
    s.gateX = 0;
  }
  emit(s, EV_SPRINT, idx, s.gateX, kind, 0);
}

/**
 * Pylon gap difficulty for this run: Rally is D2 for everyone; the Ride
 * Challenge uses the D1 gaps (design 6.2: its pool targets a 72-86% novice
 * win rate on its own speed curve), queue runs use the rated difficulty.
 */
function courseDiff(s: SimState): number {
  'worklet';
  if (s.mode === MODE_RALLY) return 2;
  if (s.mode === MODE_RIDE) return 1;
  return s.diff;
}

function spawnChunk(s: SimState, qi: number): void {
  'worklet';
  const c = CHUNKS[s.cq[qi]];
  const x0 = s.cqX[qi];
  // Map chunk-local coin lines to global line slots.
  const localToGlobal = [-1, -1, -1, -1, -1, -1, -1, -1];
  const e = c.e;
  for (let k = 0; k + 4 < e.length; k += 5) {
    const t = e[k];
    if (entityTier(t) > s.etier) continue;
    const x = x0 + e[k + 1];
    let y = e[k + 2];
    if (t === E_TOKEN) {
      if (s.tokenPlaced) continue;
      s.tokenPlaced = 1;
      spawn(s, E_TOKEN, x, y, s.sprint, 0, 0);
      continue;
    }
    if (t === E_COIN) {
      const lp = e[k + 3] & 7;
      const fl = e[k + 4];
      if (localToGlobal[lp] < 0) localToGlobal[lp] = newLine(s);
      const g = localToGlobal[lp];
      // Close-line coins follow the real pylon gap (D1 wider, D3 tighter).
      if ((fl & CF_CLOSE) && !(fl & 16)) {
        const cls = (fl >> 2) & 3;
        const delta = (authorGap(cls) - pylonGap(courseDiff(s), cls)) >> 1;
        y += fl & 2 ? -delta : delta;
      }
      s.lineTotal[g]++;
      spawn(s, E_COIN, x, y, 0, fl & 31, g);
      continue;
    }
    if (t === E_PYLON) {
      spawn(s, E_PYLON, x, y, pylonGap(courseDiff(s), e[k + 3]), 0, 0);
      continue;
    }
    spawn(s, t, x, y, e[k + 3], e[k + 4], 0);
  }
  // A sprint whose chunks carry no token slot gets one on the rush approach.
  if (qi === s.cqN - 1 && !s.tokenPlaced && s.sprint < 3 && s.etier >= 1 && s.gateX > 0) {
    s.tokenPlaced = 1;
    spawn(s, E_TOKEN, s.rushX + 120, 260, s.sprint, 0, 0);
  }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export function createSim(cfg: SimConfig): SimState {
  'worklet';
  const st = speedTable(cfg.mode, cfg.difficulty);
  const s: SimState = {
    seed: cfg.seed | 0,
    mode: cfg.mode,
    diff: clampi(cfg.difficulty | 0, 1, 3),
    tier: clampi(cfg.tier | 0, 0, 12),
    etier: effectiveTier(cfg.mode, cfg.tier | 0),
    runs: cfg.runs | 0,
    speedBase: st[0] * Q,
    speedCap: st[1] * Q,
    frenzyAt: (cfg.runs | 0) < 3 && cfg.mode !== MODE_RALLY ? 10 : 12,
    step: 0,
    worldT: 0,
    activeSteps: 0,
    speedSteps: 0,
    phase: PH_PLAY,
    phaseSteps: 0,
    pocketLen: cfg.mode === MODE_RIDE ? POCKET_RIDE : POCKET_QUEUE,
    clockSteps: CLOCK_BASE,
    bonusSteps: 0,
    lineBoostSteps: 0,
    y: 500 * Q,
    vy: 0,
    py: 500 * Q,
    holding: 0,
    lastPress: 0,
    lastTouch: 0,
    settle: 0,
    touchCool: 0,
    dist: 0,
    pdist: 0,
    speed: st[0] * Q,
    speedEff: st[0] * Q,
    gates: 0,
    iframes: 0,
    boost: 0,
    odArmed: 0,
    od: 0,
    hearts: HEARTS,
    shield: 0,
    reviveShield: 0,
    reviveUsed: 0,
    rescueUsed: 0,
    rescueAvail: cfg.rescues ? 1 : 0,
    gateNear: 0,
    float: 0,
    floatSteps: 0,
    popGrace: 0,
    pocketY: 500 * Q,
    rushK: 0,
    draft: 0,
    draftSteps: 0,
    draftAcc: 0,
    doomCool: 0,
    score: 0,
    distAcc: 0,
    chain: 0,
    chainTimer: 0,
    chainCoins: 0,
    frenzy: 0,
    frenzyCount: 0,
    frenzyNext: (cfg.runs | 0) < 3 && cfg.mode !== MODE_RALLY ? 10 : 12,
    tokens: 0,
    tokenMask: 0,
    skimStack: 0,
    skimTimer: 0,
    ladder: 0,
    ladderTimer: 0,
    maxChain: 0,
    maxTier: 0,
    regrabN: 0,
    lastGateBonus: 0,
    crowd: 0,
    crowdAway: 0,
    crowdOut: 0,
    giftCool: 0,
    grazeBand: 0,
    grazeEnt: -1,
    sprint: -1,
    sprintStart: 0,
    gateX: 0,
    gateKind: G_TIDE,
    rushX: 0,
    courseEnd: cfg.mode === MODE_RIDE ? 15000 : 0,
    cq: zeros(CQ_CAP),
    cqX: zeros(CQ_CAP),
    cqN: 0,
    cqNext: 0,
    tokenPlaced: 0,
    lineSeq: 0,
    lineTotal: zeros(LINE_CAP),
    lineGot: zeros(LINE_CAP),
    lineId: zeros(LINE_CAP),
    et: zeros(ENT_CAP),
    ex: zeros(ENT_CAP),
    ey: zeros(ENT_CAP),
    epx: zeros(ENT_CAP),
    epy: zeros(ENT_CAP),
    ep1: zeros(ENT_CAP),
    ep2: zeros(ENT_CAP),
    est: zeros(ENT_CAP),
    etm: zeros(ENT_CAP),
    evx: zeros(ENT_CAP),
    evy: zeros(ENT_CAP),
    ef: zeros(ENT_CAP),
    eline: zeros(ENT_CAP),
    eg: zeros(ENT_CAP),
    ec: zeros(ENT_CAP),
    egp: zeros(ENT_CAP),
    egb: zeros(ENT_CAP),
    eo: zeros(ENT_CAP),
    eHint: 0,
    rs: hash2(cfg.seed | 0, 0x5eed) | 0,
    ev: zeros(EV_CAP * EV_STRIDE),
    evN: 0,
    evStale: 0,
    hash: 2166136261,
    stSkims: 0,
    stCloseSkims: 0,
    stHaloSteps: 0,
    stCloseSteps: 0,
    stPasses: 0,
    stPerfects: 0,
    stRings: 0,
    stChomps: 0,
    stSmashes: 0,
    stHits: 0,
    stCoins: 0,
    stCoinsTotal: 0,
    stOverdrives: 0,
    stFrenzies: 0,
    stBounces: 0,
    stTouches: 0,
    stRegrabs: 0,
    stTele: 0,
    stReactN: 0,
    stReactSum: 0,
    stReactFast: 0,
    reactS: zeros(64),
    lastTele: -1,
    holdStart: 0,
    holdHist: zeros(32),
    stPerfectTight: 0,
    stRingOpp: 0,
    inputsSinceSkim: 0,
    consecClose: 0,
    maxConsecClose: 0,
    splitSteps: zeros(8),
    splitScores: zeros(8),
    finishStep: 0,
    endReason: END_NONE,
  };
  startSprint(s, 0, null, 0);
  return s;
}

export function ellipseRect(cx: number, cy: number, rx: number, ry: number, x0: number, y0: number, x1: number, y1: number): boolean {
  'worklet';
  if (x1 < x0 || y1 < y0) return false;
  const px = cx < x0 ? x0 : cx > x1 ? x1 : cx;
  const py = cy < y0 ? y0 : cy > y1 ? y1 : cy;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx * ry * ry + dy * dy * rx * rx <= rx * rx * ry * ry;
}

export function ellipseCircle(cx: number, cy: number, rx: number, ry: number, x: number, y: number, r: number): boolean {
  'worklet';
  const a = rx + r;
  const b = ry + r;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx * b * b + dy * dy * a * a <= a * a * b * b;
}

/** Current jelly centre y (u). */
export function jellyY(s: SimState, i: number): number {
  'worklet';
  const p = idiv(s.worldT * 1024, JELLY_PERIOD) + s.ep1[i];
  return s.ey[i] + ((JELLY_BOB * isin(p)) >> 8);
}

/** Puffer radius (u) from its inflate state. */
export function pufferR(s: SimState, i: number): number {
  'worklet';
  const k = s.est[i] >= 2 ? clampi(s.etm[i], 0, PUFF_INFLATE_STEPS) : 0;
  if (s.est[i] === 4) return PUFF_R0;
  return PUFF_R0 + idiv((PUFF_R1 - PUFF_R0) * k, PUFF_INFLATE_STEPS);
}

/** Hazard vs an ellipse at (cx, cy). art=true uses art edges, else hitboxes. */
function hazardTouches(s: SimState, i: number, cx: number, cy: number, rx: number, ry: number, art: boolean): boolean {
  'worklet';
  const t = s.et[i];
  const inset = art ? 0 : HIT_INSET;
  if (t === E_PYLON) {
    const x0 = s.ex[i] + inset;
    const x1 = s.ex[i] + PYLON_W - inset;
    const half = s.ep1[i] >> 1;
    const top = s.ey[i] - half;
    const bot = s.ey[i] + half;
    return ellipseRect(cx, cy, rx, ry, x0, SURFACE_Y - 200, x1, top - inset)
      || ellipseRect(cx, cy, rx, ry, x0, bot + inset, x1, FLOOR_Y + 200);
  }
  if (t === E_JELLY) {
    return ellipseCircle(cx, cy, rx, ry, s.ex[i], jellyY(s, i), JELLY_R - inset);
  }
  if (t === E_PUFFER) {
    return ellipseCircle(cx, cy, rx, ry, s.ex[i], s.ey[i], pufferR(s, i) - (art ? 0 : 8));
  }
  if (t === E_TORPEDO) {
    if (s.est[i] < 1 || s.est[i] > 3) return false;
    const hw = TORP_W >> 1;
    const hh = TORP_H >> 1;
    return ellipseRect(cx, cy, rx, ry, s.ex[i] - hw + inset, s.ey[i] - hh + inset, s.ex[i] + hw - inset, s.ey[i] + hh - inset);
  }
  return false;
}

export function isHazard(t: number): boolean {
  'worklet';
  return t === E_PYLON || t === E_JELLY || t === E_PUFFER || t === E_TORPEDO;
}

/** Left and right art extents of a hazard (u), for passes, badges and float. */
export function hazardSpan(s: SimState, i: number): number[] {
  'worklet';
  const t = s.et[i];
  if (t === E_PYLON) return [s.ex[i], s.ex[i] + PYLON_W];
  if (t === E_JELLY) return [s.ex[i] - JELLY_R, s.ex[i] + JELLY_R];
  if (t === E_PUFFER) return [s.ex[i] - PUFF_R1, s.ex[i] + PUFF_R1];
  if (t === E_TORPEDO) return [s.ex[i] - (TORP_W >> 1), s.ex[i] + (TORP_W >> 1)];
  return [s.ex[i], s.ex[i]];
}

// ---------------------------------------------------------------------------
// Scoring, chain, Frenzy, Boost and Overdrive
// ---------------------------------------------------------------------------

/** Chain tier 0..3 (x1 0-2, x2 3-5, x3 6-8, x4 9+). */
export function chainTier(s: SimState): number {
  'worklet';
  const t = idiv(s.chain, 3);
  return t > 3 ? 3 : t;
}

/**
 * Score multiplier: tier + 1, plus half again in Frenzy (x6 ceiling). Design
 * 5.8 tuning lever 5: the starting x2 (x8) let Frenzy carry 48-67% of the bot
 * points against the <= 30% / 40% lock rule; x1.5 is the documented fallback.
 */
export function multiplier(s: SimState): number {
  'worklet';
  const m = chainTier(s) + 1;
  return s.frenzy > 0 ? m + (m >> 1) : m;
}

function scoringOn(s: SimState): boolean {
  'worklet';
  return s.float === 0 && s.popGrace === 0 && s.reviveShield === 0 && s.phase === PH_PLAY;
}

/** Multiplied points (the caller multiplies): straight to the score, no pot. */
function addScore(s: SimState, pts: number): void {
  'worklet';
  s.score += pts;
}

/** Flat points (distance, Gate Bonus, Full Clear, regrab refunds). */
function addFlat(s: SimState, pts: number): void {
  'worklet';
  s.score += pts;
}

function addBoost(s: SimState, amt: number): void {
  'worklet';
  if (s.etier < 2 || s.od > 0 || s.odArmed) return;
  const before = idiv(s.boost, BOOST_SEG);
  s.boost = clampi(s.boost + amt, 0, BOOST_MAX);
  const after = idiv(s.boost, BOOST_SEG);
  if (after > before) emit(s, EV_BOOST_SEG, after, 0, 0, 0);
  if (s.boost >= BOOST_MAX && !s.odArmed) {
    s.odArmed = 1;
    emit(s, EV_OD_ARMED, s.dist >> 8, s.y >> 8, 0, 0);
  }
}

/** Overdrive fires on the next Close Skim or Perfect ring once armed (design 5.5). */
function odTrigger(s: SimState, why: number): void {
  'worklet';
  if (!s.odArmed || s.od > 0) return;
  s.odArmed = 0;
  s.od = OD_STEPS;
  s.stOverdrives++;
  emit(s, EV_OD_START, s.dist >> 8, s.y >> 8, why, 0);
}

/** One chain count (line, ring, skim, chomp, token, a 3+ regrab). */
function chainCount(s: SimState): void {
  'worklet';
  const before = chainTier(s);
  const wasFrenzy = s.frenzy > 0;
  s.chain++;
  s.chainTimer = CHAIN_WINDOW;
  if (s.mode === MODE_RALLY) s.crowd++;
  if (s.chain > s.maxChain) s.maxChain = s.chain;
  // Frenzy at frenzyAt; the next one needs +12 counts after a Frenzy ends
  // (counts scored inside a Frenzy never extend it or bank toward the next).
  if (!wasFrenzy && s.chain >= s.frenzyNext) {
    s.frenzy = FRENZY_STEPS;
    s.frenzyCount++;
    s.stFrenzies++;
    emit(s, EV_FRENZY_START, s.chain, 0, 0, 0);
    return;
  }
  const after = chainTier(s);
  if (after > s.maxTier) s.maxTier = after;
  if (after > before) emit(s, EV_CHAIN_TIER, after, s.chain, 0, 0);
}

function chainEvent(s: SimState, counts: number): void {
  'worklet';
  for (let k = 0; k < counts; k++) chainCount(s);
}

function breakChain(s: SimState, reason: number): void {
  'worklet';
  if (s.chain > 0) emit(s, EV_CHAIN_BREAK, chainTier(s), s.chain, reason, 0);
  s.chain = 0;
  s.chainCoins = 0;
  s.chainTimer = 0;
  if (s.frenzy === 0) s.frenzyNext = s.frenzyAt;
}

// ---------------------------------------------------------------------------
// Bubble Gift placement (Rally, design 11.3)
// ---------------------------------------------------------------------------

/** Is world x clear of hazards (300u), gates (300u) and the lead-in? */
function giftSlotOk(s: SimState, x: number): boolean {
  'worklet';
  if (x < s.sprintStart) return false;
  for (let i = 0; i < ENT_CAP; i++) {
    const t = s.et[i];
    if (t === E_GATE) {
      if (absi(s.ex[i] - x) < 300) return false;
      continue;
    }
    if (!isHazard(t)) continue;
    const sp = hazardSpan(s, i);
    if (x + 300 + 280 > sp[0] && x - 300 < sp[1]) return false;
  }
  if (s.gateX > 0 && absi(s.gateX - x) < 300 + 280) return false;
  return true;
}

function placeGift(s: SimState, eventId: number): void {
  'worklet';
  const du = s.dist >> 8;
  const start = du + idiv((s.speed >> 8) * 3, 2);
  for (let k = 0; k < 40; k++) {
    const x = start + k * 50;
    if (!giftSlotOk(s, x)) continue;
    const y = clampi(s.y >> 8, 200, 800);
    const j = spawn(s, E_GIFT, x, y, eventId, 0, 0);
    if (j >= 0) {
      s.giftCool = GIFT_COOL;
      emit(s, EV_GIFT_IN, eventId, x, y, 0);
    }
    return;
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function noteReaction(s: SimState): void {
  'worklet';
  if (s.lastTele < 0) return;
  const r = s.step - s.lastTele;
  if (s.stReactN < 64) s.reactS[s.stReactN] = r;
  s.stReactN++;
  s.stReactSum += r;
  if (r < 4) s.stReactFast++;
  s.lastTele = -1;
}

/**
 * Apply one logged input at the current step (before step()). Every mode,
 * every client and the server verifier go through here.
 */
export function applyInput(s: SimState, kind: number, sub: number, arg: number): void {
  'worklet';
  if (s.phase === PH_DONE) return;
  if (kind === IN_PRESS) {
    if (s.holding) return;
    s.holding = 1;
    s.lastPress = s.step;
    s.lastTouch = s.step;
    s.holdStart = s.step;
    s.inputsSinceSkim++;
    s.settle = 0;
    noteReaction(s);
    if (s.float > 0) {
      s.float = 0;
      s.floatSteps = 0;
      s.popGrace = POP_GRACE;
      emit(s, EV_FLOAT_POP, s.dist >> 8, s.y >> 8, 0, 0);
    }
    if (s.phase === PH_PLAY && s.vy > 0) {
      s.vy -= 180 * Q + idiv(s.vy * 35, 100);
    }
    return;
  }
  if (kind === IN_RELEASE) {
    if (!s.holding) return;
    s.holding = 0;
    s.lastTouch = s.step;
    s.inputsSinceSkim++;
    const d = s.step - s.holdStart;
    const b = clampi(d >> 1, 0, 31);
    s.holdHist[b]++;
    noteReaction(s);
    if (s.phase === PH_PLAY && s.vy < 0) s.vy += 120 * Q;
    return;
  }
  if (kind === IN_EXT) {
    if (sub === EXT_REVIVE || sub === EXT_RIDE_RESCUE) {
      if (s.phase !== PH_WIPE) return;
      if (sub === EXT_REVIVE && (s.reviveUsed || !timedMode(s.mode))) return;
      if (sub === EXT_RIDE_RESCUE && (s.rescueUsed || s.mode !== MODE_RIDE || !s.rescueAvail)) return;
      if (sub === EXT_REVIVE) s.reviveUsed = 1;
      else s.rescueUsed = 1;
      s.phase = PH_PLAY;
      s.phaseSteps = 0;
      s.hearts = 1;
      s.reviveShield = REVIVE_SHIELD;
      s.iframes = REVIVE_SHIELD;
      s.y = 500 * Q;
      s.vy = 0;
      s.lastTouch = s.step;
      emit(s, EV_REVIVE, sub, arg, 0, 0);
      return;
    }
    if (sub === EXT_LINE_BOOST) {
      if (!timedMode(s.mode) || s.lineBoostSteps >= LINE_BOOST_MAX) return;
      const room = CLOCK_CAP - (CLOCK_BASE + s.bonusSteps);
      const add = clampi(LINE_BOOST_STEPS, 0, room);
      if (add <= 0) return;
      s.lineBoostSteps += add;
      s.bonusSteps += add;
      s.clockSteps += add;
      emit(s, EV_LINE_BOOST, add, arg, 0, 0);
      return;
    }
    if (sub === EXT_DRAFT_ON) {
      if (s.mode !== MODE_RALLY && s.mode !== MODE_GHOST) return;
      if (!s.draft) {
        s.draft = 1;
        s.draftSteps = 0;
        emit(s, EV_DRAFT, 1, arg, 0, 0);
      }
      return;
    }
    if (sub === EXT_DRAFT_OFF) {
      if (s.draft) emit(s, EV_DRAFT, 0, 0, 0, 0);
      s.draft = 0;
      return;
    }
    if (sub === EXT_BUBBLE_GIFT) {
      if (s.mode !== MODE_RALLY || s.phase !== PH_PLAY || s.giftCool > 0) return;
      placeGift(s, arg);
      return;
    }
    // EXT_PAUSE_RESUME: recorded for plausibility (exact-state resume, QUEUE REALITY).
  }
}

// ---------------------------------------------------------------------------
// Hits, chomps and Overdrive smashes
// ---------------------------------------------------------------------------

function sharkHit(s: SimState, i: number): void {
  'worklet';
  if (s.iframes > 0 || s.float > 0 || s.popGrace > 0 || s.phase !== PH_PLAY) return;
  s.ef[i] |= F_HIT;
  s.etm[i] = 0;
  if (s.et[i] === E_PUFFER) s.est[i] = 4; // deflate and flee
  if (s.et[i] === E_TORPEDO) s.est[i] = 4; // spin out
  const x = s.dist >> 8;
  const y = s.y >> 8;
  if (s.shield) {
    s.shield = 0;
    s.iframes = IFRAMES;
    emit(s, EV_SHIELD_POP, x, y, 0, 0);
    return;
  }
  // v7.1: a hit costs exactly a heart and a recoverable Coin Scatter.
  s.hearts--;
  s.stHits++;
  s.iframes = IFRAMES;
  const n = clampi(idiv(s.chainCoins * 4, 10), 0, 12);
  const v = 10 * multiplier(s);
  const deducted = clampi(n * v, 0, s.score);
  s.score -= deducted;
  s.chainCoins -= n;
  s.regrabN = 0;
  const r = { s: s.rs };
  let left = deducted;
  for (let k = 0; k < n; k++) {
    const j = spawn(s, E_SCATTER, x + 10, y, 0, 0, 0);
    if (j < 0) break;
    // Each coin refunds exactly its share of what was deducted.
    const share = k === n - 1 ? left : idiv(deducted, n);
    left -= share;
    s.ep2[j] = share;
    // Out of the shark: forward and up or down, then drifting back to be chased.
    s.evx[j] = rngRange(r, 220, 460) * Q;
    s.evy[j] = (rngRange(r, 0, 760) - 520) * Q;
  }
  s.rs = r.s;
  if (n > 0) emit(s, EV_SCATTER, n, x, y, deducted);
  if (s.mode === MODE_RALLY && s.crowd > 0) {
    s.crowdOut = idiv(s.crowd * 3, 10);
    s.crowdAway = SCATTER_STEPS;
  }
  emit(s, EV_HIT, x, y, s.hearts, s.et[i]);
  if (s.hearts <= 0) {
    s.phase = PH_WIPE;
    s.phaseSteps = 0;
    s.holding = 0;
    s.od = 0;
    breakChain(s, 3);
    emit(s, EV_WIPEOUT, x, y, 0, 0);
  }
}

function chomp(s: SimState, i: number, pts: number, kind: number): void {
  'worklet';
  s.ef[i] |= F_DONE;
  s.est[i] = 5;
  s.etm[i] = 0;
  s.stChomps++;
  const x = s.ex[i];
  const y = s.et[i] === E_JELLY ? jellyY(s, i) : s.ey[i];
  if (scoringOn(s)) {
    addScore(s, pts * multiplier(s));
    addBoost(s, 25);
    chainEvent(s, 1);
  }
  emit(s, EV_CHOMP, x, y, kind, pts);
  if (s.et[i] === E_BOX) {
    // Spill 5 coins that spray forward, then settle.
    const r = { s: s.rs };
    for (let k = 0; k < 5; k++) {
      const j = spawn(s, E_SCATTER, x, y, 1, 0, 0);
      if (j < 0) break;
      s.evx[j] = rngRange(r, 160, 360) * Q;
      s.evy[j] = (rngRange(r, 0, 500) - 330) * Q;
    }
    s.rs = r.s;
  }
}

/** Overdrive contact: the hazard is smashed (Chomp 60, 1 chain count). */
function smash(s: SimState, i: number): void {
  'worklet';
  const t = s.et[i];
  if (s.ef[i] & F_SMASH) return;
  s.ef[i] |= F_SMASH;
  s.stSmashes++;
  if (t === E_PYLON) {
    // Pylons stay standing: a bolt pops and the lattice shudders.
    s.etm[i] = 0;
    s.stChomps++;
    if (scoringOn(s)) {
      addScore(s, 60 * multiplier(s));
      chainEvent(s, 1);
    }
    emit(s, EV_CHOMP, s.dist >> 8, s.y >> 8, E_PYLON, 60);
    return;
  }
  chomp(s, i, 60, t);
  if (t === E_TORPEDO) s.est[i] = 4;
}

// ---------------------------------------------------------------------------
// Step helpers
// ---------------------------------------------------------------------------

function speedMulQ8(s: SimState): number {
  'worklet';
  let m = 256;
  if (s.od > 0 && s.mode !== MODE_RALLY) m = 320; // x1.25
  if (s.rushK > 0) m = (m * (256 + idiv(s.rushK, 9))) >> 8; // Gate Rush +12.5%
  if (s.float > 0) {
    if (s.mode === MODE_RIDE) m = 0;
    else m = (m * 90) >> 8; // 35%
  }
  return m;
}

function bounce(s: SimState, which: number): void {
  'worklet';
  s.stBounces++;
  emit(s, EV_BOUNCE, which, s.dist >> 8, 0, 0);
  if (s.chain > 0) breakChain(s, which === 0 ? 4 : 5);
}

function softTouch(s: SimState, which: number): void {
  'worklet';
  s.stTouches++;
  if (s.touchCool === 0) emit(s, EV_TOUCH, which, s.dist >> 8, 0, 0);
  s.touchCool = 15;
}

function sharkPhysics(s: SimState): void {
  'worklet';
  const sf = speedFrac(s);
  s.py = s.y;
  if (s.float > 0) {
    // Ease to y 500 inside the bubble.
    const target = 500 * Q;
    s.y += (target - s.y) >> 4;
    s.vy = 0;
    return;
  }
  const yU = s.y >> 8;
  const idle = s.step - s.lastTouch;
  const nearEdge = yU < SURFACE_Y + 200 || yU > FLOOR_Y - 200;
  const settling = !s.holding && (idle >= SETTLE_IDLE || (nearEdge && idle >= SETTLE_IDLE_EDGE));
  if (settling && !s.settle) {
    s.settle = 1;
    emit(s, EV_SETTLE, yU, 0, 0, 0);
  }
  if (settling) {
    // Neutral Settle: a critically damped spring to y 500 (omega 6/s).
    const accel = -36 * (s.y - 500 * Q) - 12 * s.vy;
    s.vy += idiv(accel, STEP_HZ);
    s.vy = clampi(s.vy, -SETTLE_VMAX * Q, SETTLE_VMAX * Q);
    s.y += idiv(s.vy, STEP_HZ);
  } else {
    let accel: number;
    if (s.holding) accel = -(2600 + ((650 * sf) >> 8));
    else accel = 1900 + ((285 * sf) >> 8);
    const dv = idiv(accel * Q, STEP_HZ);
    if ((accel < 0 && s.vy > 0) || (accel > 0 && s.vy < 0)) s.vy -= idiv(s.vy * 3, 64);
    s.vy += dv;
    s.vy = clampi(s.vy, -720 * Q, 820 * Q);
    s.y += idiv(s.vy, STEP_HZ);
  }
  // Soft edges (design 3.4d): a touch at |vy| <= 300 never breaks the chain.
  if (s.y < SHARK_MIN_Y * Q) {
    s.y = SHARK_MIN_Y * Q;
    if (s.vy < -SOFT_VY * Q) {
      s.vy = 120 * Q;
      bounce(s, 0);
    } else {
      s.vy = 60 * Q;
      softTouch(s, 0);
    }
  } else if (s.y > SHARK_MAX_Y * Q) {
    s.y = SHARK_MAX_Y * Q;
    if (s.vy > SOFT_VY * Q) {
      s.vy = -420 * Q;
      bounce(s, 1);
    } else {
      s.vy = -60 * Q;
      softTouch(s, 1);
    }
  }
}

function hazardAhead(s: SimState, lookU: number): boolean {
  'worklet';
  const du = s.dist >> 8;
  for (let i = 0; i < ENT_CAP; i++) {
    const t = s.et[i];
    if (!isHazard(t)) continue;
    if (s.ef[i] & F_HIT) continue;
    if (t === E_TORPEDO && (s.est[i] === 1 || s.est[i] === 2)) return true;
    if (t === E_PUFFER && s.est[i] === 1) return true;
    const sp = hazardSpan(s, i);
    if (sp[1] >= du - SIL_RX - 20 && sp[0] <= du + lookU) return true;
  }
  return false;
}

/** Doom predictor (design 3.4g): an unavoidable hit within 6 steps under hold AND release. */
function doomCheck(s: SimState): boolean {
  'worklet';
  const sf = speedFrac(s);
  const m = speedMulQ8(s);
  const adv = ((idiv(s.speed, STEP_HZ) * m) >> 8) >> 8;
  for (let mode = 0; mode < 2; mode++) {
    let y = s.y;
    let vy = s.vy;
    if (mode === 1 && vy > 0) vy -= 180 * Q + idiv(vy * 35, 100);
    if (mode === 0 && vy < 0) vy += 120 * Q;
    let hit = false;
    for (let k = 1; k <= 6 && !hit; k++) {
      const accel = mode === 1 ? -(2600 + ((650 * sf) >> 8)) : 1900 + ((285 * sf) >> 8);
      if ((accel < 0 && vy > 0) || (accel > 0 && vy < 0)) vy -= idiv(vy * 3, 64);
      vy = clampi(vy + idiv(accel * Q, STEP_HZ), -720 * Q, 820 * Q);
      y = clampi(y + idiv(vy, STEP_HZ), SHARK_MIN_Y * Q, SHARK_MAX_Y * Q);
      const cx = (s.dist >> 8) + adv * k;
      for (let i = 0; i < ENT_CAP && !hit; i++) {
        const t = s.et[i];
        if (!isHazard(t) || (s.ef[i] & F_HIT)) continue;
        if (t === E_PUFFER && s.est[i] >= 4) continue;
        if (absi(s.ex[i] - cx) > 260) continue;
        if (hazardTouches(s, i, cx, y >> 8, SHARK_RX, SHARK_RY, false)) hit = true;
      }
    }
    if (!hit) return false;
  }
  return true;
}

function updateEntities(s: SimState, du: number): void {
  'worklet';
  const ahead = aheadU(s);
  const spd = s.speedEff >> 8;
  // 600ms of travel at full speed (a Float's slow drift must not shorten it),
  // plus 2 steps of margin: the speed ramp and the speed-based anchor pan move
  // the view edge forward while the badge is up, which could shave a step.
  const sb = s.speed >> 8;
  const bv = spd > sb ? spd : sb;
  const badgeLead = idiv(bv * 6, 10) + idiv(bv * 2, 60) + 12;
  for (let i = 0; i < ENT_CAP; i++) {
    const t = s.et[i];
    if (t === E_NONE) continue;
    s.epx[i] = s.ex[i];
    s.epy[i] = t === E_JELLY ? jellyY(s, i) : s.ey[i];
    s.etm[i]++;
    // Despawn behind the shark.
    if (t !== E_TORPEDO && t !== E_SCATTER && s.ex[i] + 260 < du - anchorX(s)) {
      s.et[i] = E_NONE;
      continue;
    }
    if (isHazard(t) && !(s.ef[i] & F_HIT)) {
      const pdu = s.pdist >> 8;
      if (s.ex[i] > pdu && s.ex[i] <= du) emit(s, EV_PASS, t, s.speedEff >> 8, 0, 0);
    }
    if (isHazard(t) && !(s.ef[i] & F_BADGE) && t !== E_TORPEDO) {
      const sp = hazardSpan(s, i);
      if (sp[0] <= du + ahead + badgeLead) {
        s.ef[i] |= F_BADGE;
        emit(s, EV_BADGE, i, t, 0, 0);
        s.lastTele = s.step;
        s.stTele++;
      }
    }
    if (t === E_GIFT) {
      // The gift bubble pops into a 5-coin line in its lane 260u ahead.
      if (s.ex[i] - du <= 260) {
        const g = newLine(s);
        for (let k = 0; k < 5; k++) {
          s.lineTotal[g]++;
          spawn(s, E_COIN, s.ex[i] + k * 70, s.ey[i], 0, CF_GIFT, g);
        }
        emit(s, EV_GIFT_POP, s.ex[i], s.ey[i], s.ep1[i], 0);
        s.et[i] = E_NONE;
      }
      continue;
    }
    if (t === E_PUFFER) {
      const dx = s.ex[i] - du;
      if (s.est[i] === 0 && dx <= PUFF_INFLATE_DX + idiv(spd * 4, 10)) {
        s.est[i] = 1; // wiggle telegraph (400ms)
        s.etm[i] = 0;
        emit(s, EV_PUFFER_WIGGLE, i, s.ex[i], s.ey[i], 0);
        s.lastTele = s.step;
      } else if (s.est[i] === 1 && dx <= PUFF_INFLATE_DX) {
        s.est[i] = 2; // inflating
        s.etm[i] = 0;
      } else if (s.est[i] === 4) {
        // Fleeing down-left, spinning.
        s.ex[i] -= 3;
        s.ey[i] += 5;
      }
      continue;
    }
    if (t === E_TORPEDO) {
      const st = s.est[i];
      if (st === 0) {
        if (du + ahead + 40 >= s.ex[i]) {
          s.est[i] = 1;
          s.etm[i] = 0;
          s.ey[i] = s.y >> 8;
          emit(s, EV_TORPEDO_TRACK, i, 0, 0, 0);
          s.lastTele = s.step;
          s.stTele++;
        }
      }
      if (s.est[i] === 1 || s.est[i] === 2) {
        // Hover at the right edge while tracking then locked.
        s.ex[i] = du + ahead - 40;
        if (s.est[i] === 1) {
          const target = s.y >> 8;
          s.ey[i] += ((target - s.ey[i]) * 51) >> 8;
          if (s.etm[i] >= TORP_TRACK) {
            s.est[i] = 2;
            s.etm[i] = 0;
            emit(s, EV_TORPEDO_LOCK, i, s.ey[i], 0, 0);
            s.lastTele = s.step;
          }
        } else if (s.etm[i] >= TORP_LOCK) {
          s.est[i] = 3;
          s.etm[i] = 0;
        }
      } else if (s.est[i] === 3) {
        // Launched: 1.9x world speed closing (0.9x in world coords).
        s.ex[i] -= idiv(((s.speed >> 8) * 9), 10 * STEP_HZ) + 1;
      } else if (s.est[i] === 4) {
        s.ex[i] -= 2;
      }
      if (s.est[i] >= 3 && s.ex[i] + 300 < du - anchorX(s)) s.et[i] = E_NONE;
      continue;
    }
    if (t === E_SCATTER) {
      // Coin Scatter (Sonic): gravity arcs with real bounces (restitution 0.6).
      // Relative to the shark they burst ahead, slow, then drift back at
      // 120 u/s, so a player steering to their lane wins them back.
      s.ex[i] += idiv(s.evx[i] + s.speedEff - 120 * Q, STEP_HZ * Q);
      s.evy[i] += idiv(1400 * Q, STEP_HZ);
      s.ey[i] += idiv(s.evy[i], STEP_HZ * Q);
      s.evx[i] -= idiv(s.evx[i], 30);
      if (s.ey[i] > FLOOR_Y - 24) {
        s.ey[i] = FLOOR_Y - 24;
        s.evy[i] = -idiv(s.evy[i] * 6, 10);
      }
      if (s.ey[i] < SURFACE_Y + 24) {
        s.ey[i] = SURFACE_Y + 24;
        s.evy[i] = -idiv(s.evy[i] * 6, 10);
      }
      if (s.etm[i] >= SCATTER_STEPS) s.et[i] = E_NONE;
      continue;
    }
  }
}

/** Pass end (design 3.3): decide the Skim credit from the whole window. */
function passEnd(s: SimState, i: number): void {
  'worklet';
  s.ef[i] &= ~F_PASS;
  if (s.ef[i] & (F_HIT | F_SKIMMED | F_GHOST)) return;
  // A pass that mostly clipped the art earns nothing (no reward for clipping).
  if (s.eo[i] >= s.eg[i]) return;
  const close = s.ec[i] >= GRAZE_MIN_STEPS;
  const skimmed = close || s.eg[i] >= GRAZE_MIN_STEPS;
  if (!skimmed) return;
  s.ef[i] |= F_SKIMMED;
  s.stSkims++;
  s.stPasses++;
  if (close) {
    s.stCloseSkims++;
    s.consecClose = s.inputsSinceSkim < 2 ? s.consecClose + 1 : 0;
    if (s.consecClose > s.maxConsecClose) s.maxConsecClose = s.consecClose;
  }
  s.inputsSinceSkim = 0;
  s.skimStack = s.skimTimer > 0 ? clampi(s.skimStack + 1, 1, 4) : 1;
  s.skimTimer = 60;
  emit(s, EV_SKIM, s.dist >> 8, s.y >> 8, close ? 1 : 0, i);
  if (!scoringOn(s)) return;
  chainEvent(s, close ? 2 : 1);
  if (close) odTrigger(s, 1);
}

/** Per-step graze accumulation inside a hazard's halo. */
function grazeStep(s: SimState, i: number, du: number, sy: number): void {
  'worklet';
  if (s.ef[i] & (F_HIT | F_SKIMMED)) return;
  let band = 0;
  if (hazardTouches(s, i, du, sy, SIL_RX + 1, SIL_RY + 1, true)) band = 3;
  else if (hazardTouches(s, i, du, sy, SIL_RX + GRAZE_CLOSE, SIL_RY + GRAZE_CLOSE, true)) band = 2;
  else if (hazardTouches(s, i, du, sy, SIL_RX + GRAZE_HALO, SIL_RY + GRAZE_HALO, true)) band = 1;
  if (band === 0) {
    if (s.ef[i] & F_PASS) passEnd(s, i);
    return;
  }
  s.ef[i] |= F_PASS;
  if (band === 3) {
    // Overlapping art without a hit pays nothing.
    s.eo[i]++;
    return;
  }
  s.eg[i]++;
  s.stHaloSteps++;
  if (band === 2 || s.grazeBand === 0) {
    s.grazeBand = band === 2 ? 2 : 1;
    s.grazeEnt = i;
  }
  if (band === 2) {
    s.ec[i]++;
    s.stCloseSteps++;
  }
  emit(s, EV_GRAZE, band === 2 ? 1 : 0, i, sy, 0);
  if (!scoringOn(s)) return;
  const base = band === 2 ? 5 : 2;
  const pay = clampi(GRAZE_PTS_CAP - s.egp[i], 0, base);
  if (pay > 0) {
    s.egp[i] += pay;
    addScore(s, pay * multiplier(s) * (s.od > 0 ? 2 : 1));
  }
  const b = clampi(GRAZE_BOOST_CAP - s.egb[i], 0, band === 2 ? 4 : 2);
  if (b > 0) {
    s.egb[i] += b;
    addBoost(s, b);
  }
}

function end(s: SimState, reason: number): void {
  'worklet';
  if (s.phase === PH_DONE) return;
  s.phase = PH_DONE;
  s.endReason = reason;
  emit(s, EV_END, reason, s.score, s.hearts, s.tokens);
}

/** Gate Bonus (design 5.7): 100 x the multiplier at the gate line, flat. */
function gateBonus(s: SimState, kind: number): void {
  'worklet';
  const m = multiplier(s);
  const pts = 100 * m;
  addFlat(s, pts);
  s.lastGateBonus = pts;
  emit(s, EV_GATE_BONUS, pts, m, s.frenzy > 0 ? 1 : 0, kind);
}

function gate(s: SimState, i: number): void {
  'worklet';
  const kind = s.ep1[i];
  const k = clampi(s.gates, 0, 7);
  if (kind === G_SPLIT) {
    gateBonus(s, kind);
    s.splitSteps[k] = s.step;
    s.splitScores[k] = s.score;
    s.gates++;
    emit(s, EV_GATE, 0, kind, s.step, s.gates);
    return;
  }
  if (kind === G_FINISH || kind === G_RIDE) {
    gateBonus(s, kind);
    s.splitSteps[k] = s.step;
    s.splitScores[k] = s.score;
    s.finishStep = s.step;
    emit(s, EV_GATE, 0, kind, s.step, s.gates + 1);
    end(s, kind === G_FINISH ? END_FINISH : END_GATE);
    return;
  }
  // Tide Gate: a flat +4s (cap 60s), the Gate Bonus, then a Tide Pocket.
  gateBonus(s, kind);
  let bonus = 0;
  if (timedMode(s.mode)) {
    const room = CLOCK_CAP - (CLOCK_BASE + s.bonusSteps);
    bonus = clampi(GATE_CLOCK, 0, room);
    s.bonusSteps += bonus;
    s.clockSteps += bonus;
  }
  s.splitSteps[k] = s.step;
  s.splitScores[k] = s.score;
  s.gates++;
  // v7.1 engaged-player rule: holding on the gate-line step collapses the pocket.
  const full = s.mode === MODE_RIDE ? POCKET_RIDE : POCKET_QUEUE;
  s.pocketLen = s.holding ? POCKET_SHORT : full;
  emit(s, EV_GATE, bonus, kind, s.step, s.gates);
  s.phase = PH_POCKET;
  s.phaseSteps = 0;
  s.pocketY = s.y;
  s.float = 0;
  s.settle = 0;
  // The next sprint streams in now, placed after the pocket's cruise (the
  // speed is constant in a pocket, so this is exact) and its lead-in.
  startSprint(s, s.sprint + 1, null, idiv(idiv(s.speed, STEP_HZ) * s.pocketLen, Q));
}

function collectCoin(s: SimState, i: number): void {
  'worklet';
  const t = s.et[i];
  const cy = s.ey[i];
  const cx = s.ex[i];
  const fl = s.ep2[i];
  s.ef[i] |= F_DONE;
  s.et[i] = E_NONE;
  s.stCoins++;
  s.stCoinsTotal++;
  s.ladder = s.ladderTimer > 0 ? clampi(s.ladder + 1, 0, 12) : 0;
  s.ladderTimer = 24;
  if (s.chain > 0) s.chainTimer = CHAIN_WINDOW;
  if (t === E_SCATTER && s.ep1[i] === 0) {
    // Coin Scatter regrab: refund exactly what this coin took, window extends.
    addFlat(s, fl);
    s.regrabN++;
    s.stRegrabs++;
    emit(s, EV_COIN, cx, cy, s.ladder, 1);
    if (s.regrabN === 3) {
      chainEvent(s, 1);
      s.crowdAway = 0;
      emit(s, EV_REGRAB, cx, cy, s.regrabN, fl);
    }
    return;
  }
  s.chainCoins++;
  const m = multiplier(s);
  const gift = t === E_COIN && (fl & CF_GIFT) !== 0;
  addScore(s, 10 * (gift && m > 4 ? 4 : m));
  emit(s, EV_COIN, cx, cy, s.ladder, (s.frenzy > 0 ? 2 : 0) | (fl & CF_CLOSE ? 4 : 0) | (fl & CF_RUSH ? 8 : 0) | (gift ? 16 : 0));
  if (t === E_COIN) {
    const g = s.eline[i];
    s.lineGot[g]++;
    if (s.lineGot[g] === s.lineTotal[g] && s.lineTotal[g] >= 3) {
      addScore(s, 30 * (gift && m > 4 ? 4 : m));
      chainEvent(s, 1);
      emit(s, EV_LINE, cx, cy, s.lineTotal[g], gift ? 1 : 0);
    }
  }
}

function collide(s: SimState, du: number, pdu: number): void {
  'worklet';
  const sy = s.y >> 8;
  const on = scoringOn(s);
  const safe = s.float > 0 || s.popGrace > 0 || s.reviveShield > 0;
  const magnet = s.frenzy > 0 ? 220 : s.od > 0 ? 200 : 0;
  for (let i = 0; i < ENT_CAP; i++) {
    const t = s.et[i];
    if (t === E_NONE || (s.ef[i] & F_DONE)) continue;
    const dx = s.ex[i] - du;
    if (dx > 340 || dx < -340) continue;
    if (t === E_COIN || t === E_SCATTER) {
      if (!on) continue;
      if (t === E_SCATTER && s.etm[i] < 12) continue;
      const cy = s.ey[i];
      let got = ellipseCircle(du, sy, SHARK_RX + 14, SHARK_RY + 14, s.ex[i], cy, COIN_R);
      if (!got && magnet > 0) {
        const ddy = cy - sy;
        got = dx * dx + ddy * ddy <= magnet * magnet;
      }
      if (got) collectCoin(s, i);
      continue;
    }
    if (t === E_RING) {
      if (!(pdu < s.ex[i] && du >= s.ex[i])) continue;
      s.ef[i] |= F_DONE;
      const d = absi(sy - s.ey[i]);
      s.stRingOpp++;
      if (d > RING_R - 10 || !on) continue;
      const perfect = d <= RING_PERFECT;
      s.stRings++;
      if (perfect) s.stPerfects++;
      if (d <= 4) s.stPerfectTight++;
      addScore(s, (perfect ? 120 : 50) * multiplier(s));
      addBoost(s, perfect ? 50 : 15);
      chainEvent(s, perfect ? 2 : 1);
      emit(s, EV_RING, s.ex[i], s.ey[i], perfect ? 1 : 0, d);
      if (perfect) odTrigger(s, 2);
      continue;
    }
    if (t === E_TOKEN) {
      if (!on || !ellipseCircle(du, sy, SHARK_RX, SHARK_RY, s.ex[i], s.ey[i], TOKEN_R)) continue;
      s.ef[i] |= F_DONE;
      s.et[i] = E_NONE;
      const slot = clampi(s.ep1[i], 0, 2);
      if (!(s.tokenMask & (1 << slot))) {
        s.tokenMask |= 1 << slot;
        s.tokens++;
      }
      addScore(s, 200 * multiplier(s));
      addBoost(s, 50);
      chainEvent(s, 1);
      emit(s, EV_TOKEN, s.ex[i], s.ey[i], slot, s.tokens);
      if (s.tokens === 3) {
        addFlat(s, 500);
        emit(s, EV_TOKEN_SET, 500, 0, 0, 0);
      }
      continue;
    }
    if (t === E_SHIELD) {
      if (!ellipseCircle(du, sy, SHARK_RX, SHARK_RY, s.ex[i], s.ey[i], SHIELD_R)) continue;
      s.ef[i] |= F_DONE;
      s.et[i] = E_NONE;
      s.shield = 1;
      emit(s, EV_SHIELD_GET, s.ex[i], s.ey[i], 0, 0);
      continue;
    }
    if (t === E_BOX) {
      if (safe || !ellipseCircle(du, sy, SHARK_RX, SHARK_RY, s.ex[i], s.ey[i], BOX_R)) continue;
      chomp(s, i, 40, E_BOX);
      continue;
    }
    if (t === E_GATE) {
      if (du < s.ex[i]) continue;
      s.ef[i] |= F_DONE;
      gate(s, i);
      if (s.phase !== PH_PLAY) return;
      continue;
    }
    if (!isHazard(t) || (s.ef[i] & F_HIT)) continue;
    if (t === E_PUFFER && s.est[i] >= 4) continue;
    if (t === E_TORPEDO && (s.est[i] === 0 || s.est[i] >= 4)) continue;
    const touching = hazardTouches(s, i, du, sy, SHARK_RX, SHARK_RY, false);
    if (safe) {
      if (touching) s.ef[i] |= F_GHOST;
      if (s.ef[i] & F_PASS) passEnd(s, i);
      continue;
    }
    if (touching && s.od > 0) {
      smash(s, i);
      if (s.et[i] !== E_PYLON) continue;
    } else if (t === E_PUFFER) {
      const inflated = s.est[i] >= 2 && s.etm[i] >= 4;
      if (touching) {
        if (!inflated) chomp(s, i, 60, E_PUFFER);
        else sharkHit(s, i);
        if (s.phase !== PH_PLAY) return;
        continue;
      }
    } else if (touching) {
      sharkHit(s, i);
      if (s.phase !== PH_PLAY) return;
      continue;
    }
    grazeStep(s, i, du, sy);
  }
}

export function scatterCount(s: SimState): number {
  'worklet';
  let n = 0;
  for (let i = 0; i < ENT_CAP; i++) if (s.et[i] === E_SCATTER && s.ep1[i] === 0) n++;
  return n;
}

export function stateHash(s: SimState): number {
  'worklet';
  let h = s.hash;
  h = fnv(h, s.y);
  h = fnv(h, s.vy);
  h = fnv(h, s.speed);
  h = fnv(h, s.dist);
  h = fnv(h, s.score);
  h = fnv(h, s.hearts);
  h = fnv(h, s.boost);
  h = fnv(h, s.chain);
  h = fnv(h, scatterCount(s));
  return h >>> 0;
}

/**
 * Advance one fixed 1/60s step. Inputs for this step must already be applied.
 * Events for the step are in s.ev[0 .. s.evN*EV_STRIDE).
 */
function stepInner(s: SimState): void {
  'worklet';
  s.step++;
  if (s.phase === PH_DONE) return;
  s.pdist = s.dist;
  s.py = s.y;
  const pdu = s.dist >> 8;

  if (s.float === 2) {
    // Hover-Freeze: the sim stops until a touch.
    for (let i = 0; i < ENT_CAP; i++) {
      s.epx[i] = s.ex[i];
      s.epy[i] = s.et[i] === E_JELLY ? jellyY(s, i) : s.ey[i];
    }
    return;
  }

  s.worldT++;
  if (s.touchCool > 0) s.touchCool--;
  if (s.phase === PH_WIPE) {
    s.phaseSteps++;
    const canRevive = timedMode(s.mode) && !s.reviveUsed;
    const canRescue = s.mode === MODE_RIDE && !s.rescueUsed && s.rescueAvail > 0;
    const limit = WIPE_ANIM + (canRevive || canRescue ? REVIVE_WINDOW : 0);
    if (s.phaseSteps >= limit) end(s, END_WIPEOUT);
    return;
  }

  if (s.phase === PH_POCKET) {
    s.phaseSteps++;
    // Auto-cruise on a gentle sine at y 500; nothing can hurt; clock frozen.
    const target = 500 * Q + 40 * isin(s.phaseSteps * 12);
    s.y += (target - s.y) >> 3;
    s.vy = 0;
    if (s.rushK > 0) s.rushK = s.rushK > 24 ? s.rushK - 24 : 0;
    s.dist += idiv(s.speed, STEP_HZ);
    const du = s.dist >> 8;
    while (s.cqNext < s.cqN && s.cqX[s.cqNext] <= du + 1500) {
      spawnChunk(s, s.cqNext);
      s.cqNext++;
    }
    updateEntities(s, du);
    const left = s.pocketLen - s.phaseSteps;
    if (s.pocketLen === POCKET_SHORT) {
      if (left === 18) emit(s, EV_PIP, 3, 1, 0, 0);
    } else if (left === 72 || left === 36 || left === 0) {
      emit(s, EV_PIP, left === 72 ? 1 : left === 36 ? 2 : 3, 0, 0, 0);
    }
    if (s.phaseSteps >= s.pocketLen) {
      s.phase = PH_PLAY;
      s.phaseSteps = 0;
      s.vy = 0;
      // The pocket is "look up" time: Settle and Float idle counts restart at
      // its exit, so a player gets the full window to put a thumb back down.
      if (!s.holding) s.lastTouch = s.step;
      emit(s, EV_POCKET_END, s.sprint, 0, 0, 0);
    }
    return;
  }

  // --- PLAY ---
  s.activeSteps++;
  if (s.float === 0) s.speedSteps++;
  s.phaseSteps++;
  if (timedMode(s.mode)) {
    s.clockSteps--;
    if (s.clockSteps <= 300 && s.clockSteps > 0 && s.clockSteps % 60 === 0) emit(s, EV_CLOCK_TICK, idiv(s.clockSteps, 60), 0, 0, 0);
    if (s.clockSteps <= 0) {
      s.clockSteps = 0;
      end(s, END_TIME);
      return;
    }
  }

  // Speed ramp: +4.2 u/s per active second, +25 per gate, capped.
  const sp = s.speedBase + idiv(s.speedSteps * 42 * Q, 600) + (s.mode === MODE_RALLY ? 0 : s.gates * 25 * Q);
  s.speed = sp > s.speedCap ? s.speedCap : sp;

  // Bubble Float: arms after 1.8s without a touch, when nothing is near (1.0s).
  if (s.float === 1) {
    s.floatSteps++;
    if (s.floatSteps >= FLOAT_FREEZE) {
      s.float = 2;
      emit(s, EV_FREEZE, 0, 0, 0, 0);
      return;
    }
  } else if (!s.holding && s.activeSteps > 180 && s.step - s.lastTouch >= FLOAT_ARM && s.od === 0
    && s.popGrace === 0 && s.reviveShield === 0) {
    if (!hazardAhead(s, (s.speed >> 8) + SIL_RX)) {
      s.float = 1;
      s.floatSteps = 0;
      emit(s, EV_FLOAT_IN, s.dist >> 8, s.y >> 8, 0, 0);
    }
  }

  // Timers.
  if (s.iframes > 0) s.iframes--;
  if (s.popGrace > 0) s.popGrace--;
  if (s.reviveShield > 0) s.reviveShield--;
  if (s.skimTimer > 0) s.skimTimer--;
  if (s.ladderTimer > 0) s.ladderTimer--;
  if (s.doomCool > 0) s.doomCool--;
  if (s.giftCool > 0) s.giftCool--;
  if (s.crowdAway > 0) s.crowdAway--;
  if (s.od > 0) {
    s.od--;
    if (s.od === 0) {
      s.boost = 0;
      s.iframes = OD_IFRAMES;
      emit(s, EV_OD_END, s.dist >> 8, s.y >> 8, 0, 0);
    }
  }
  if (s.draft) {
    s.draftSteps++;
    s.draftAcc++;
    if (s.draftAcc >= 60) {
      s.draftAcc = 0;
      addBoost(s, 100);
    }
    if (s.draftSteps >= DRAFT_MAX) {
      s.draft = 0;
      emit(s, EV_DRAFT, 0, 0, 0, 0);
    }
  }
  if (s.float === 0) {
    if (s.frenzy > 0) {
      s.frenzy--;
      if (s.frenzy === 0) {
        emit(s, EV_FRENZY_END, s.chain, 0, 0, 0);
        s.chainTimer = CHAIN_WINDOW;
        s.frenzyNext = s.chain + 12;
      }
    } else if (s.chainTimer > 0 && s.iframes === 0) {
      // The window freezes in i-frames (a hit can't time the chain out).
      s.chainTimer--;
      if (s.chainTimer === 0) breakChain(s, 0);
    }
  }

  // Gate Rush: +12% over 300ms inside the rush zone, out over 200ms after.
  const duNow = s.dist >> 8;
  const inRush = s.gateX > 0 && duNow >= s.gateX - rushLen(s.speed >> 8) && duNow < s.gateX;
  let splitRush = false;
  if (!inRush && s.mode === MODE_RALLY) {
    for (let i = 0; i < ENT_CAP; i++) {
      if (s.et[i] !== E_GATE || s.ep1[i] !== G_SPLIT || (s.ef[i] & F_DONE)) continue;
      if (duNow >= s.ex[i] - rushLen(s.speed >> 8) && duNow < s.ex[i]) splitRush = true;
    }
  }
  if (inRush || splitRush) {
    if (s.rushK === 0) emit(s, EV_RUSH, inRush ? s.gateX : duNow, s.gateKind, 0, 0);
    s.rushK = s.rushK + 16 > 288 ? 288 : s.rushK + 16;
  } else if (s.rushK > 0) {
    s.rushK = s.rushK > 24 ? s.rushK - 24 : 0;
  }

  s.speedEff = (s.speed * speedMulQ8(s)) >> 8;
  sharkPhysics(s);
  s.dist += idiv(s.speedEff, STEP_HZ);
  const du = s.dist >> 8;

  // Stream chunks in ahead of the view.
  while (s.cqNext < s.cqN && s.cqX[s.cqNext] <= du + 1500) {
    spawnChunk(s, s.cqNext);
    s.cqNext++;
  }

  updateEntities(s, du);
  s.grazeBand = 0;
  s.grazeEnt = -1;
  collide(s, du, pdu);
  if (s.phase !== PH_PLAY) return;

  // Distance points: 1 per 50u, flat (not in Float, a revive shield or Rally).
  if (s.float === 0 && s.reviveShield === 0 && s.mode !== MODE_RALLY) {
    s.distAcc += du - pdu;
    while (s.distAcc >= 50) {
      s.distAcc -= 50;
      addFlat(s, 1);
    }
  }

  // Ride / Rally finish beat: the Ride Gate is about to enter view.
  if ((s.gateKind === G_RIDE || s.gateKind === G_FINISH) && !s.gateNear && s.gateX > 0 && s.gateX - du <= aheadU(s) + 180) {
    s.gateNear = 1;
    emit(s, EV_GATE_NEAR, s.gateX, 0, 0, 0);
  }

  // Doom slow-mo (presentation) when the next hit is unavoidable and fatal.
  if (s.hearts === 1 && !s.shield && s.iframes === 0 && s.float === 0 && s.popGrace === 0 && s.doomCool === 0
    && s.od === 0 && s.reviveShield === 0 && (s.reviveUsed || s.mode === MODE_RIDE || s.mode === MODE_RALLY)) {
    if (doomCheck(s)) {
      s.doomCool = 60;
      emit(s, EV_DOOM, du, s.y >> 8, 0, 0);
    }
  }

  if (s.phaseSteps % 6 === 0) emit(s, EV_SCORE, s.score, 0, 0, 0);
  if (s.step % 600 === 0) s.hash = stateHash(s);
}

/**
 * Advance one fixed 1/60s step. Inputs for this step must already be applied
 * (their events join this step's batch). Events: s.ev[0 .. s.evN*EV_STRIDE).
 */
export function step(s: SimState): void {
  'worklet';
  if (s.evStale) s.evN = 0;
  s.evStale = 0;
  stepInner(s);
  s.evStale = 1;
}

// ---------------------------------------------------------------------------
// Input log: varint(stepDelta << 2 | kind) [+ varint sub, varint arg] -> base64
// ---------------------------------------------------------------------------

export interface InputEntry {
  step: number;
  kind: number;
  sub: number;
  arg: number;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function pushVarint(out: number[], v: number): void {
  'worklet';
  let x = v >>> 0;
  while (x >= 0x80) {
    out.push((x & 0x7f) | 0x80);
    x >>>= 7;
  }
  out.push(x);
}

export function encodeInputs(entries: InputEntry[]): string {
  'worklet';
  const bytes: number[] = [];
  let last = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const d = e.step - last;
    last = e.step;
    pushVarint(bytes, (d * 4 + (e.kind & 3)) >>> 0);
    if (e.kind === IN_EXT) {
      pushVarint(bytes, e.sub);
      pushVarint(bytes, e.arg);
    }
  }
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    s += B64[b0 >> 2];
    s += B64[((b0 & 3) << 4) | (b1 >> 4)];
    s += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    s += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return s;
}

export function decodeInputs(str: string): InputEntry[] {
  'worklet';
  const bytes: number[] = [];
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '=') break;
    const v = B64.indexOf(ch);
    if (v < 0) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 0xff);
    }
  }
  const out: InputEntry[] = [];
  let p = 0;
  let step = 0;
  const readVar = (): number => {
    let x = 0;
    let mul = 1;
    while (p < bytes.length) {
      const b = bytes[p++];
      x += (b & 0x7f) * mul;
      mul *= 128;
      if (!(b & 0x80)) break;
    }
    return x;
  };
  while (p < bytes.length) {
    const v = readVar();
    const kind = v & 3;
    step += idiv(v, 4);
    let sub = 0;
    let arg = 0;
    if (kind === IN_EXT) {
      sub = readVar();
      arg = readVar();
    }
    out.push({ step, kind, sub, arg });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Replay (verifier, ghosts, session restore)
// ---------------------------------------------------------------------------

/**
 * Replay a run: inputs whose step === s.step are applied before each step().
 * Stops at PH_DONE or maxSteps. `onStep` sees every step (ghost timelines).
 */
export function replay(cfg: SimConfig, entries: InputEntry[], maxSteps: number, onStep?: (s: SimState) => void): SimState {
  'worklet';
  const s = createSim(cfg);
  let k = 0;
  while (s.step < maxSteps && s.phase !== PH_DONE) {
    while (k < entries.length && entries[k].step <= s.step) {
      const e = entries[k++];
      applyInput(s, e.kind, e.sub, e.arg);
    }
    step(s);
    if (onStep) onStep(s);
  }
  return s;
}

/** Final state hash including the tail (proof `state_hash`). */
export function finalHash(s: SimState): number {
  'worklet';
  return fnv(stateHash(s), s.step);
}

// ---------------------------------------------------------------------------
// Plausibility (design 12.4): flags for review, never a rejection by itself.
// ---------------------------------------------------------------------------

export interface Plausibility {
  reactN: number;
  reactMeanSteps: number;
  reactFast: number;
  holdEntropyBits: number;
  perfectTightRatio: number;
  closeShare: number;
  maxConsecClose: number;
  flagged: boolean;
  reasons: string[];
}

export function plausibility(s: SimState): Plausibility {
  'worklet';
  const reasons: string[] = [];
  const mean = s.stReactN > 0 ? s.stReactSum / s.stReactN : 99;
  const n = s.stReactN < 64 ? s.stReactN : 64;
  const sorted = s.reactS.slice(0, n).sort((a, b) => a - b);
  const median = n > 0 ? sorted[n >> 1] : 99;
  if (n >= 6 && median < 9) reasons.push('reaction_median');
  if (s.stReactFast >= 3 && s.stReactN >= 6 && s.stReactFast * 2 > s.stReactN) reasons.push('reaction_floor');
  let total = 0;
  for (let i = 0; i < 32; i++) total += s.holdHist[i];
  let ent = 0;
  if (total > 0) {
    for (let i = 0; i < 32; i++) {
      if (!s.holdHist[i]) continue;
      const p = s.holdHist[i] / total;
      ent -= p * (Math.log(p) / Math.LN2);
    }
  }
  if (total >= 10 && ent < 2.0) reasons.push('timing_entropy');
  const ratio = s.stRingOpp >= 15 ? s.stPerfectTight / s.stRingOpp : 0;
  if (ratio > 0.35) reasons.push('frame_perfect');
  const closeShare = s.stHaloSteps > 0 ? s.stCloseSteps / s.stHaloSteps : 0;
  if (s.stPasses >= 15 && closeShare > 0.7) reasons.push('close_band');
  if (s.maxConsecClose >= 8) reasons.push('close_streak');
  return {
    reactN: s.stReactN,
    reactMeanSteps: mean,
    reactFast: s.stReactFast,
    holdEntropyBits: ent,
    perfectTightRatio: ratio,
    closeShare,
    maxConsecClose: s.maxConsecClose,
    flagged: reasons.length > 0,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Bot targeting and the fast lookahead planner (bots, tests, chunk gates).
// ---------------------------------------------------------------------------

/**
 * Best y to aim for given the hazards ahead (u). Deterministic heuristic.
 * hug = 0 the lazy centre line, 1 the Close line (skill line, design 4.4).
 */
export function botTargetY(s: SimState, lookU: number, hug: number): number {
  'worklet';
  const du = s.dist >> 8;
  let best = -1;
  let bestX = 1e9;
  for (let i = 0; i < ENT_CAP; i++) {
    const t = s.et[i];
    if (!isHazard(t) || (s.ef[i] & (F_HIT | F_DONE))) continue;
    const sp = hazardSpan(s, i);
    if (sp[1] < du - SHARK_RX || sp[0] > du + lookU) continue;
    if (sp[0] < bestX) {
      bestX = sp[0];
      best = i;
    }
  }
  const sy = s.y >> 8;
  if (best < 0) {
    // Follow coins / rings.
    let cy = 500;
    let cx = 1e9;
    for (let i = 0; i < ENT_CAP; i++) {
      const t = s.et[i];
      if (t !== E_COIN && t !== E_RING && t !== E_TOKEN && t !== E_BOX) continue;
      if (s.ef[i] & F_DONE) continue;
      if (s.ex[i] < du || s.ex[i] > du + lookU) continue;
      if (s.ex[i] < cx) {
        cx = s.ex[i];
        cy = s.ey[i];
      }
    }
    return cy;
  }
  const t = s.et[best];
  if (t === E_PYLON) {
    if (!hug) return s.ey[best];
    const half = s.ep1[best] >> 1;
    const top = s.ey[best] - half + SIL_RY + 8;
    const bot = s.ey[best] + half - SIL_RY - 8;
    return absi(sy - top) <= absi(sy - bot) ? top : bot;
  }
  // Circles and torpedoes: pick the side with more room, considering neighbours.
  const hy = t === E_JELLY ? jellyY(s, best) : s.ey[best];
  const r = t === E_JELLY ? JELLY_R : t === E_PUFFER ? PUFF_R1 : TORP_H >> 1;
  const pad = hug ? 18 : 40;
  const above = hy - r - SHARK_RY - pad;
  const below = hy + r + SHARK_RY + pad;
  let upOk = above > SHARK_MIN_Y + 10;
  let downOk = below < SHARK_MAX_Y - 10;
  for (let i = 0; i < ENT_CAP; i++) {
    if (i === best) continue;
    const t2 = s.et[i];
    if (!isHazard(t2) || (s.ef[i] & (F_HIT | F_DONE))) continue;
    if (absi(s.ex[i] - s.ex[best]) > 220) continue;
    if (t2 === E_PYLON) continue;
    const y2 = t2 === E_JELLY ? jellyY(s, i) : s.ey[i];
    const r2 = t2 === E_JELLY ? JELLY_R : t2 === E_PUFFER ? PUFF_R1 : TORP_H >> 1;
    if (absi(y2 - above) < r2 + SHARK_RY + 20) upOk = false;
    if (absi(y2 - below) < r2 + SHARK_RY + 20) downOk = false;
  }
  if (upOk && downOk) return absi(sy - above) < absi(sy - below) ? above : below;
  if (upOk) return above;
  if (downOk) return below;
  return absi(sy - above) < absi(sy - below) ? above : below;
}

/** Deep copy of a sim state (planner bots, doom tests, ghost forks). */
export function cloneSim(s: SimState): SimState {
  'worklet';
  const o: Record<string, unknown> = {};
  const src = s as unknown as Record<string, unknown>;
  for (const k in src) {
    const v = src[k];
    o[k] = Array.isArray(v) ? (v as number[]).slice() : v;
  }
  return o as unknown as SimState;
}

/**
 * Replace the rest of the current sprint with `chunkIds` starting `lead`u
 * ahead (chunk gates in tests: one chunk at a time at a fixed speed).
 */
export function setCourse(s: SimState, chunkIds: number[], lead: number): void {
  'worklet';
  for (let i = 0; i < ENT_CAP; i++) s.et[i] = E_NONE;
  let x = (s.dist >> 8) + lead;
  s.cqN = 0;
  s.cqNext = 0;
  s.tokenPlaced = 0;
  for (let i = 0; i < chunkIds.length && i < s.cq.length; i++) {
    s.cq[i] = chunkIds[i];
    s.cqX[i] = x;
    x += CHUNKS[chunkIds[i]].len;
    s.cqN++;
  }
  s.rushX = x;
  s.gateX = x + rushLen(s.speed >> 8);
  s.gateKind = G_TIDE;
  spawn(s, E_GATE, s.gateX, 500, G_TIDE, 0, 0);
}

function touchesAhead(s: SimState, cx: number, cy: number, tAdd: number, k: number): boolean {
  'worklet';
  for (let i = 0; i < ENT_CAP; i++) {
    const t = s.et[i];
    if (!isHazard(t) || (s.ef[i] & F_HIT)) continue;
    let x = s.ex[i];
    if (t === E_TORPEDO) {
      const st = s.est[i];
      if (st === 0 || st >= 4) continue;
      const rest = st === 1 ? TORP_TRACK - s.etm[i] + TORP_LOCK : st === 2 ? TORP_LOCK - s.etm[i] : 0;
      const fly = k - (rest > 0 ? rest : 0);
      const du0 = s.dist >> 8;
      const hover = du0 + aheadU(s) - 40 + (cx - du0);
      x = st === 3 ? s.ex[i] - (fly * idiv(((s.speed >> 8) * 9), 10 * STEP_HZ)) : (fly > 0 ? hover - fly * idiv(((s.speed >> 8) * 9), 10 * STEP_HZ) : hover);
      if (absi(x - cx) > 160) continue;
      const hw = TORP_W >> 1;
      const hh = TORP_H >> 1;
      if (ellipseRect(cx, cy, SHARK_RX + 4, SHARK_RY + 4, x - hw + HIT_INSET, s.ey[i] - hh + HIT_INSET, x + hw - HIT_INSET, s.ey[i] + hh - HIT_INSET)) return true;
      continue;
    }
    if (x - cx > 240 || x - cx < -240) continue;
    if (t === E_PYLON) {
      const half = s.ep1[i] >> 1;
      const top = s.ey[i] - half;
      const bot = s.ey[i] + half;
      if (ellipseRect(cx, cy, SHARK_RX + 3, SHARK_RY + 3, x + HIT_INSET, SURFACE_Y - 200, x + PYLON_W - HIT_INSET, top - HIT_INSET)
        || ellipseRect(cx, cy, SHARK_RX + 3, SHARK_RY + 3, x + HIT_INSET, bot + HIT_INSET, x + PYLON_W - HIT_INSET, FLOOR_Y + 200)) return true;
    } else if (t === E_JELLY) {
      const p = idiv((s.worldT + tAdd) * 1024, JELLY_PERIOD) + s.ep1[i];
      const jy = s.ey[i] + ((JELLY_BOB * isin(p)) >> 8);
      if (ellipseCircle(cx, cy, SHARK_RX + 3, SHARK_RY + 3, x, jy, JELLY_R - HIT_INSET)) return true;
    } else if (t === E_PUFFER) {
      if (s.est[i] >= 4) continue;
      if (ellipseCircle(cx, cy, SHARK_RX + 3, SHARK_RY + 3, x, s.ey[i], PUFF_R1 - 8)) return true;
    }
  }
  return false;
}

/**
 * Choose hold (1) or release (0) for the next `every` steps so that some
 * continuation of `horizon` decisions stays hit-free. -1 = none found in
 * budget. Deterministic. Models thrust, sink, the kicks and Neutral Settle
 * (a long release springs back to y 500), like the real step.
 */
export function planHold(s: SimState, every: number, horizon: number, budget: number, prefer: number): number {
  'worklet';
  const sf = speedFrac(s);
  const adv = idiv(s.speedEff, STEP_HZ);
  const thrust = idiv(-(2600 + ((650 * sf) >> 8)) * Q, STEP_HZ);
  const sink = idiv((1900 + ((285 * sf) >> 8)) * Q, STEP_HZ);
  const minY = SHARK_MIN_Y * Q;
  const maxY = SHARK_MAX_Y * Q;
  // Overdrive and i-frames make contact harmless only until they run out.
  const invuln = s.od > 0 ? s.od + OD_IFRAMES : s.iframes;
  const sy: number[] = [];
  const svy: number[] = [];
  const sh: number[] = [];
  const sk: number[] = [];
  const sc: number[] = [];
  const si: number[] = [];
  let nodes = 0;
  sy.push(s.y); svy.push(s.vy); sh.push(s.holding); sk.push(0); sc.push(0); si.push(s.step - s.lastTouch);
  const rootFirst = prefer;
  let rootChoice = -1;
  while (sy.length > 0) {
    const top = sy.length - 1;
    if (sc[top] >= 2) {
      sy.pop(); svy.pop(); sh.pop(); sk.pop(); sc.pop(); si.pop();
      continue;
    }
    const choice = sc[top] === 0 ? prefer : 1 - prefer;
    sc[top]++;
    if (top === 0) rootChoice = sc[top] === 1 ? rootFirst : 1 - rootFirst;
    if (++nodes > budget) return -1;
    let y = sy[top];
    let vy = svy[top];
    let holding = sh[top];
    let idle = si[top];
    const k0 = sk[top];
    if (choice === 1 && !holding) {
      if (vy > 0) vy -= 180 * Q + idiv(vy * 35, 100);
      holding = 1;
      idle = 0;
    } else if (choice === 0 && holding) {
      if (vy < 0) vy += 120 * Q;
      holding = 0;
      idle = 0;
    }
    let hit = false;
    for (let j = 1; j <= every; j++) {
      idle++; // the sim measures idle after its step counter advances
      const yU = y >> 8;
      const nearEdge = yU < SURFACE_Y + 200 || yU > FLOOR_Y - 200;
      if (!holding && (idle >= SETTLE_IDLE || (nearEdge && idle >= SETTLE_IDLE_EDGE))) {
        vy += idiv(-36 * (y - 500 * Q) - 12 * vy, STEP_HZ);
        vy = clampi(vy, -SETTLE_VMAX * Q, SETTLE_VMAX * Q);
      } else {
        const accel = holding ? thrust : sink;
        if ((accel < 0 && vy > 0) || (accel > 0 && vy < 0)) vy -= idiv(vy * 3, 64);
        vy = clampi(vy + accel, -720 * Q, 820 * Q);
      }
      y += idiv(vy, STEP_HZ);
      if (y < minY) {
        y = minY;
        if (vy < 0) vy = vy < -SOFT_VY * Q ? 120 * Q : 60 * Q;
      } else if (y > maxY) {
        y = maxY;
        if (vy > 0) vy = vy > SOFT_VY * Q ? -420 * Q : -60 * Q;
      }
      const k = k0 + j;
      const cx = (s.dist + adv * k) >> 8;
      if (k > invuln && touchesAhead(s, cx, y >> 8, k, k)) {
        hit = true;
        break;
      }
    }
    if (hit) continue;
    const depth = idiv(k0 + every, every);
    if (depth >= horizon) return top === 0 ? choice : rootChoice;
    sy.push(y); svy.push(vy); sh.push(holding); sk.push(k0 + every); sc.push(0); si.push(idle);
  }
  return -1;
}
