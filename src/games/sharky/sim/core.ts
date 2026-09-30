/**
 * Sharky Swim "Tide Run": the deterministic integer sim.
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
 * Coordinates: world units (u). The fixed view is 960 x 1000u on every device
 * (design 3.2). The shark's world x is `dist`; entities carry absolute world x.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SIM_VERSION_TAG = 'tide-run-4';
export const STEP_HZ = 60;
export const VIEW_W = 960;
export const VIEW_H = 1000;
export const SURFACE_Y = 40;
export const FLOOR_Y = 960;
export const Q = 256;

export const MODE_QUEUE = 0;
export const MODE_RIDE = 1;
export const MODE_RACE = 2;
export const MODE_GHOST = 3;
export const MODE_PRACTICE = 4;
export const MODE_NAMES = ['queue', 'ride', 'race', 'ghost', 'practice'];

export const PH_PLAY = 0;
export const PH_POCKET = 1;
export const PH_WIPE = 2;
export const PH_DONE = 3;

export const END_NONE = 0;
export const END_TIME = 1;
export const END_WIPEOUT = 2;
export const END_GATE = 3; // ride: reached the Ride Gate (win)
export const END_FINISH = 4; // race: crossed the finish
export const END_ABORT = 5;

// Input kinds (log format: varint(stepDelta << 2 | kind)).
export const IN_PRESS = 0;
export const IN_RELEASE = 1;
export const IN_DASH = 2;
export const IN_EXT = 3;
// Ext subkinds (design 11.2).
export const EXT_PAUSE_RESUME = 1;
export const EXT_CREW_FRENZY = 2;
export const EXT_RESCUE_SPAWN = 3;
export const EXT_REVIVE = 4;
export const EXT_LINE_BOOST = 5;
export const EXT_DRAFT_ON = 6;
export const EXT_DRAFT_OFF = 7;
export const EXT_RIDE_RESCUE = 8;

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

// Entity flags.
export const F_SKIMC = 1; // skim candidate (visible water gap seen)
export const F_CLOSE = 2; // sprites overlapped: no skim this pass
export const F_DONE = 4; // collected / resolved / passed
export const F_HIT = 8; // hit the shark
export const F_TELE = 16; // telegraph fired
export const F_BADGE = 32; // edge badge fired
export const F_GHOST = 64; // phased (float) while overlapping
export const F_TOKEN_SLOT = 128;

// Gate kinds.
export const G_TIDE = 0;
export const G_RIDE = 1;
export const G_SPLIT = 2;
export const G_FINISH = 3;

// Events (sim -> presentation). Stride EV_STRIDE: kind, a, b, c, d.
export const EV_STRIDE = 5;
export const EV_CAP = 48;
export const EV_COIN = 1;
export const EV_LINE = 2;
export const EV_RING = 3;
export const EV_SKIM = 4;
export const EV_CHOMP = 5;
export const EV_TOKEN = 6;
export const EV_TOKEN_SET = 7;
export const EV_BOOST_SEG = 8;
export const EV_DASH = 9;
export const EV_FIZZ = 10;
export const EV_HIT = 11;
export const EV_SHIELD_POP = 12;
export const EV_CHAIN_TIER = 13;
export const EV_CHAIN_BREAK = 14;
export const EV_FRENZY_START = 15;
export const EV_FRENZY_END = 16;
export const EV_BOUNCE = 17;
export const EV_GATE = 18;
export const EV_POCKET_END = 19;
export const EV_PIP = 20;
export const EV_BADGE = 21;
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
export const EV_SCATTER = 34;
export const EV_SHIELD_GET = 35;
export const EV_LINE_BOOST = 36;
export const EV_SPEED_BOOST = 37;
export const EV_REGAIN = 38;
export const EV_SCORE = 39;
export const EV_DRAFT = 40;
export const EV_GATE_NEAR = 41;

// Shark geometry (u).
export const SHARK_RX = 46;
export const SHARK_RY = 26;
export const SIL_RX = 60;
export const SIL_RY = 36;
export const SHARK_MIN_Y = SURFACE_Y + 30;
export const SHARK_MAX_Y = FLOOR_Y - 30;

// Hazard geometry (u).
export const PYLON_W = 100;
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
export const RING_PERFECT = 16;
export const SHIELD_R = 40;

// Systems.
export const HEARTS = 3;
export const IFRAMES = 60;
export const STUMBLE_HOLD = 15;
export const STUMBLE_RAMP = 33;
export const DASH_STEPS = 14;
export const DASH_BUFFER = 6;
export const CONTACT_GRACE = 5;
export const BOOST_MAX = 300;
export const BOOST_COST = 100;
export const CHAIN_WINDOW = 120;
export const FRENZY_STEPS = 360;
export const SCATTER_STEPS = 90;
export const FLOAT_ARM = 108;
export const FLOAT_IN = 24;
export const FLOAT_FREEZE = 360;
export const POP_GRACE = 18;
export const REVIVE_SHIELD = 120;
export const WIPE_ANIM = 54;
export const REVIVE_WINDOW = 180;
export const CLOCK_BASE = 1800; // 30s
export const CLOCK_CAP = 3600; // 60s total
export const POCKET_QUEUE = 150;
export const POCKET_RIDE = 120;
export const LINE_BOOST_STEPS = 60;
export const LINE_BOOST_MAX = 240;
export const DRAFT_MAX = 90;

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
  // x in degrees*? Use Bhaskara on t in [0,512) mapped to [0,180) degrees.
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
// Chunks (authored). Entities: [type, x, y, p1, p2]. Coins: p1 = local line.
// Pylon: y = gap centre, p1 = gap class (0 std, 1 wide, 2 tight).
// Jelly: p1 = bob phase (0..1023). Token: slot on the risky line.
// ---------------------------------------------------------------------------

export interface Chunk {
  id: number;
  name: string;
  len: number;
  diff: number;
  zone: number;
  tier: number;
  breather: number;
  e: number[];
}

// Coin line helper data is authored inline as flat numbers for speed.
export const CHUNKS: Chunk[] = [
  {
    // 0: Lagoon warm-up: coin arcs that teach hold and release. No hazards.
    id: 0, name: 'lagoon_warmup', len: 1100, diff: 1, zone: 0, tier: 0, breather: 1,
    e: [
      1, 160, 500, 0, 0, 1, 220, 470, 0, 0, 1, 280, 430, 0, 0, 1, 340, 390, 0, 0, 1, 400, 360, 0, 0, 1, 460, 350, 0, 0,
      1, 520, 360, 0, 0, 1, 580, 390, 0, 0,
      1, 680, 470, 1, 0, 1, 740, 530, 1, 0, 1, 800, 590, 1, 0, 1, 860, 640, 1, 0, 1, 920, 660, 1, 0, 1, 980, 650, 1, 0,
      2, 1060, 600, 0, 0,
    ],
  },
  {
    // 1: Pylon trio.
    id: 1, name: 'pylon_trio', len: 1000, diff: 2, zone: 1, tier: 0, breather: 0,
    e: [
      5, 120, 470, 0, 0, 1, 150, 470, 0, 0, 1, 210, 470, 0, 0,
      1, 330, 520, 1, 0, 1, 390, 560, 1, 0,
      5, 470, 600, 0, 0, 1, 500, 600, 1, 0, 1, 560, 600, 1, 0,
      3, 640, 260, 0, 0,
      5, 800, 420, 0, 0, 1, 830, 420, 2, 0, 1, 890, 420, 2, 0,
    ],
  },
  {
    // 2: Jelly drift, weave between bobbing lanterns.
    id: 2, name: 'jelly_drift', len: 900, diff: 2, zone: 1, tier: 0, breather: 0,
    e: [
      6, 160, 300, 0, 0, 6, 420, 680, 512, 0, 6, 680, 330, 256, 0,
      1, 150, 560, 0, 0, 1, 210, 560, 0, 0, 1, 270, 540, 0, 0,
      2, 420, 380, 0, 0,
      1, 560, 600, 1, 0, 1, 620, 620, 1, 0, 1, 680, 640, 1, 0,
      3, 820, 780, 0, 0,
    ],
  },
  {
    // 3: Ring lane (breather): 3 rings then a coin line.
    id: 3, name: 'ring_lane', len: 800, diff: 1, zone: 1, tier: 0, breather: 1,
    e: [
      2, 120, 520, 0, 0, 2, 300, 460, 0, 0, 2, 480, 400, 0, 0,
      1, 580, 400, 0, 0, 1, 640, 420, 0, 0, 1, 700, 450, 0, 0, 1, 760, 490, 0, 0,
    ],
  },
  {
    // 4: Pylon slalom: alternating high and low gaps.
    id: 4, name: 'pylon_slalom', len: 1300, diff: 4, zone: 2, tier: 0, breather: 0,
    e: [
      5, 100, 330, 0, 0, 1, 130, 330, 0, 0,
      5, 520, 680, 0, 0, 1, 550, 680, 1, 0, 1, 380, 520, 1, 0, 1, 440, 610, 1, 0,
      5, 940, 360, 0, 0, 1, 970, 360, 2, 0, 1, 800, 530, 2, 0, 1, 860, 440, 2, 0,
      3, 700, 850, 0, 0,
      2, 1200, 480, 0, 0,
    ],
  },
  {
    // 5: Jelly curtain: a column of lanterns with one gap, coins through it.
    id: 5, name: 'jelly_curtain', len: 1000, diff: 5, zone: 2, tier: 0, breather: 0,
    e: [
      6, 300, 170, 0, 0, 6, 300, 330, 0, 0, 6, 300, 770, 0, 0, 6, 300, 900, 0, 0,
      1, 200, 540, 0, 0, 1, 260, 540, 0, 0, 1, 320, 540, 0, 0, 1, 380, 540, 0, 0,
      6, 720, 420, 512, 0, 6, 720, 880, 512, 0,
      1, 640, 660, 1, 0, 1, 700, 660, 1, 0, 1, 760, 660, 1, 0,
      3, 880, 200, 0, 0,
    ],
  },
  {
    // 6: Box bounty: prize boxes on the lines between pylons.
    id: 6, name: 'box_bounty', len: 1000, diff: 3, zone: 1, tier: 1, breather: 0,
    e: [
      4, 160, 420, 0, 0, 4, 280, 560, 0, 0,
      5, 440, 500, 1, 0, 1, 470, 500, 0, 0, 1, 530, 500, 0, 0,
      4, 640, 330, 0, 0, 3, 700, 170, 0, 0,
      5, 840, 380, 0, 0, 1, 870, 380, 1, 0, 1, 930, 400, 1, 0,
    ],
  },
  {
    // 7: Puffer patrol: pass them early or Dash through.
    id: 7, name: 'puffer_patrol', len: 1000, diff: 4, zone: 2, tier: 2, breather: 0,
    e: [
      7, 200, 500, 0, 0,
      1, 140, 300, 0, 0, 1, 200, 300, 0, 0, 1, 260, 300, 0, 0,
      7, 480, 320, 0, 0, 7, 520, 720, 0, 0,
      1, 500, 520, 1, 0, 1, 560, 520, 1, 0,
      3, 520, 880, 0, 0,
      7, 800, 540, 0, 0, 2, 820, 290, 0, 0,
    ],
  },
  {
    // 8: Puffer in the pylon exit.
    id: 8, name: 'puffer_pylon', len: 1100, diff: 6, zone: 2, tier: 2, breather: 0,
    e: [
      5, 140, 420, 0, 0, 1, 170, 420, 0, 0,
      7, 420, 460, 0, 0, 1, 380, 640, 1, 0, 1, 440, 660, 1, 0, 1, 500, 640, 1, 0,
      5, 700, 640, 0, 0, 1, 730, 640, 2, 0,
      7, 960, 380, 0, 0, 3, 960, 820, 0, 0,
    ],
  },
  {
    // 9: Torpedo alley: a runaway bumper boat plus a pylon.
    id: 9, name: 'torpedo_alley', len: 1200, diff: 5, zone: 2, tier: 3, breather: 0,
    e: [
      8, 300, 500, 0, 0,
      1, 200, 360, 0, 0, 1, 260, 360, 0, 0, 1, 320, 360, 0, 0, 1, 380, 360, 0, 0,
      5, 820, 540, 1, 0, 1, 850, 540, 1, 0,
      3, 1000, 240, 0, 0,
      2, 1100, 560, 0, 0,
    ],
  },
  {
    // 10: Storm mix.
    id: 10, name: 'storm_mix', len: 1300, diff: 8, zone: 3, tier: 3, breather: 0,
    e: [
      5, 120, 400, 0, 0, 1, 150, 400, 0, 0,
      6, 420, 700, 0, 0, 6, 460, 250, 512, 0,
      8, 700, 500, 0, 0,
      5, 1000, 620, 0, 0, 1, 1030, 620, 1, 0, 1, 900, 560, 1, 0,
      3, 1180, 860, 0, 0,
    ],
  },
  {
    // 11: Gauntlet: tight pylons, puffers, lanterns.
    id: 11, name: 'gauntlet', len: 1400, diff: 9, zone: 3, tier: 2, breather: 0,
    e: [
      5, 120, 360, 2, 0, 1, 150, 360, 0, 0,
      7, 420, 560, 0, 0, 6, 420, 860, 256, 0,
      5, 720, 640, 2, 0, 1, 750, 640, 1, 0, 1, 620, 520, 1, 0,
      6, 1000, 330, 0, 0, 7, 1040, 700, 0, 0,
      1, 1000, 520, 2, 0, 1, 1060, 520, 2, 0, 1, 1120, 520, 2, 0,
      3, 1250, 180, 0, 0,
    ],
  },
  {
    // 12: Shield breather (ride sprint 2 only): rings and a Bubble Shield.
    id: 12, name: 'shield_breather', len: 800, diff: 1, zone: 1, tier: 0, breather: 1,
    e: [
      2, 120, 480, 0, 0, 11, 360, 500, 0, 0, 2, 560, 520, 0, 0,
      1, 640, 520, 0, 0, 1, 700, 520, 0, 0, 1, 760, 520, 0, 0,
    ],
  },
];

export const CHUNK_WARMUP = 0;
export const CHUNK_BREATHER = 3;
export const CHUNK_SHIELD = 12;

/** Minimum unlock tier for each entity type (design 5.7). */
export function entityTier(t: number): number {
  'worklet';
  if (t === E_BOX || t === E_TOKEN) return 1;
  if (t === E_PUFFER) return 2;
  if (t === E_TORPEDO) return 3;
  return 0;
}

// ---------------------------------------------------------------------------
// Config and descriptors
// ---------------------------------------------------------------------------

export interface SimConfig {
  seed: number;
  mode: number;
  /** 1..3 (queue); ride and race use their own speed tables. */
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
  chunks: number[];
  remix: number;
  sig?: string;
}

/** Speed table (u/s): [base, cap]. */
export function speedTable(mode: number, diff: number): number[] {
  'worklet';
  if (mode === MODE_RIDE) return [320, 480];
  if (mode === MODE_RACE) return [360, 520];
  if (diff <= 1) return [300, 460];
  if (diff >= 3) return [380, 560];
  return [340, 520];
}

/** Effective hazard tier for a mode (design 5.7 fairness). */
export function effectiveTier(mode: number, tier: number): number {
  'worklet';
  if (mode === MODE_RACE) return 3;
  if (mode === MODE_RIDE) return clampi(tier, 2, 4);
  return clampi(tier, 0, 12);
}

export function pylonGap(diff: number, cls: number): number {
  'worklet';
  const base = diff <= 1 ? 440 : diff >= 3 ? 320 : 380;
  return cls === 1 ? base + 60 : cls === 2 ? base - 40 : base;
}

/** Target course length per sprint (u). 0 = time-based (queue). */
export function sprintTargetLen(mode: number, sprintIdx: number, speedU: number): number {
  'worklet';
  if (mode === MODE_RIDE) return 5000;
  if (mode === MODE_RACE) return 7500;
  // Queue: about 11s at the current speed.
  const t = idiv(speedU * 105, 10);
  void sprintIdx;
  return clampi(t, 3300, 6400);
}

function diffBand(mode: number, sprintIdx: number): number[] {
  'worklet';
  if (mode === MODE_RIDE) {
    if (sprintIdx === 0) return [2, 4];
    if (sprintIdx === 1) return [3, 6];
    return [5, 7];
  }
  if (mode === MODE_RACE) return [3, 8];
  if (sprintIdx === 0) return [2, 4];
  if (sprintIdx === 1) return [4, 7];
  if (sprintIdx === 2) return [6, 9];
  return [7, 10];
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
  if (sprintIdx === 0 && mode !== MODE_RACE) {
    chunks.push(CHUNK_WARMUP);
    len += CHUNKS[CHUNK_WARMUP].len;
  }
  let guard = 0;
  while (len < target - 500 && guard < 20) {
    guard++;
    if (mode === MODE_RIDE && sprintIdx === 1 && chunks.length === 1) {
      chunks.push(CHUNK_SHIELD);
      len += CHUNKS[CHUNK_SHIELD].len;
      sinceBreather = 0;
      continue;
    }
    if (sinceBreather >= 3) {
      chunks.push(CHUNK_BREATHER);
      len += CHUNKS[CHUNK_BREATHER].len;
      sinceBreather = 0;
      last = CHUNK_BREATHER;
      continue;
    }
    // Candidates within the band, widening by 1 until something fits.
    let pickId = -1;
    for (let widen = 0; widen < 10 && pickId < 0; widen++) {
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
        if (k === 0) {
          pickId = c.id;
          break;
        }
        k--;
      }
    }
    if (pickId < 0) pickId = CHUNK_BREATHER;
    chunks.push(pickId);
    len += CHUNKS[pickId].len;
    last = pickId;
    sinceBreather++;
  }
  return { sprintIdx, chunks, remix: 0 };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export const ENT_CAP = 160;
export const LINE_CAP = 32;

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
  dist: number;
  pdist: number;
  speed: number;
  speedEff: number;
  gates: number;
  stumble: number;
  iframes: number;
  dash: number;
  dashBuf: number;
  boost: number;
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
  boostSpeed: number; // race boosts: remaining steps
  boostSpeedPct: number;
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
  pot: number;
  banked: number;
  tokens: number;
  tokenMask: number;
  skimStack: number;
  skimTimer: number;
  ladder: number;
  ladderTimer: number;
  maxChain: number;
  // course
  sprint: number;
  sprintStart: number;
  gateX: number;
  gateKind: number;
  courseEnd: number; // ride/race total length (u), 0 = endless
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
  stPerfects: number;
  stRings: number;
  stChomps: number;
  stHits: number;
  stCoins: number;
  stDashes: number;
  stFizz: number;
  stFrenzies: number;
  stBounces: number;
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
  splitSteps: number[];
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

/** Shark anchor x in the view (u): 250 at base speed, 140 at max. */
export function anchorX(s: SimState): number {
  'worklet';
  return 250 - ((110 * speedFrac(s)) >> 8);
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
  return i;
}

/**
 * Start sprint `idx`: materialize its descriptor into the chunk queue. `desc`
 * may be a server-streamed descriptor; null regenerates locally.
 */
export function startSprint(s: SimState, idx: number, desc: SprintDescriptor | null, extraLead = 0): void {
  'worklet';
  const d = desc || generateSprint(s.seed, idx, s.mode, s.tier, s.speed >> 8);
  s.sprint = idx;
  const du = distU(s);
  // Lead-in: no hazard hitbox within ~1.5s of the pocket exit.
  // Every hazard must get its full edge badge (600ms before the view), so the
  // lead covers the view ahead plus 600ms (races have no warm-up chunk).
  const lead = extraLead + (idx === 0 ? (s.mode === MODE_RACE ? aheadU(s) + 320 : 260) : idiv((s.speed >> 8) * 3, 2));
  let x = du + lead;
  s.sprintStart = x;
  s.cqN = 0;
  s.cqNext = 0;
  s.tokenPlaced = idx >= 3 || s.etier < 1 ? 1 : 0;
  for (let i = 0; i < d.chunks.length && i < s.cq.length; i++) {
    s.cq[i] = d.chunks[i];
    s.cqX[i] = x;
    x += CHUNKS[d.chunks[i]].len;
    s.cqN++;
  }
  // Gate at the end of the sprint.
  let kind = G_TIDE;
  if (s.mode === MODE_RIDE && idx >= 2) kind = G_RIDE;
  if (s.mode === MODE_RACE) kind = G_FINISH;
  s.gateKind = kind;
  s.gateX = x + 160;
  if (s.mode === MODE_RACE) {
    // One race course: mid split gate at half the course (no pocket).
    s.gateX = s.sprintStart + 7500;
    spawn(s, E_GATE, s.sprintStart + 3750, 500, G_SPLIT, 0, 0);
  }
  spawn(s, E_GATE, s.gateX, 500, kind, 0, 0);
  emit(s, EV_SPRINT, idx, s.gateX, kind, 0);
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
    const y = e[k + 2];
    if (t === E_TOKEN) {
      if (s.tokenPlaced) continue;
      s.tokenPlaced = 1;
      spawn(s, E_TOKEN, x, y, s.sprint, 0, 0);
      continue;
    }
    if (t === E_COIN) {
      const lp = e[k + 3] & 7;
      if (localToGlobal[lp] < 0) {
        const g = s.lineSeq % LINE_CAP;
        s.lineSeq++;
        localToGlobal[lp] = g;
        s.lineTotal[g] = 0;
        s.lineGot[g] = 0;
        s.lineId[g] = s.lineSeq;
      }
      const g = localToGlobal[lp];
      s.lineTotal[g]++;
      spawn(s, E_COIN, x, y, 0, 0, g);
      continue;
    }
    if (t === E_PYLON) {
      spawn(s, E_PYLON, x, y, pylonGap(s.mode === MODE_RACE ? 2 : s.diff, e[k + 3]), 0, 0);
      continue;
    }
    spawn(s, t, x, y, e[k + 3], e[k + 4], 0);
  }
  // A sprint whose chunks carry no token slot gets one on the gate approach.
  if (qi === s.cqN - 1 && !s.tokenPlaced && s.sprint < 3 && s.etier >= 1) {
    s.tokenPlaced = 1;
    spawn(s, E_TOKEN, s.gateX - 300, 230, s.sprint, 0, 0);
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
    frenzyAt: (cfg.runs | 0) < 3 && cfg.mode !== MODE_RACE ? 10 : 12,
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
    dist: 0,
    pdist: 0,
    speed: st[0] * Q,
    speedEff: st[0] * Q,
    gates: 0,
    stumble: 0,
    iframes: 0,
    dash: 0,
    dashBuf: 0,
    boost: 0,
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
    boostSpeed: 0,
    boostSpeedPct: 0,
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
    pot: 0,
    banked: 0,
    tokens: 0,
    tokenMask: 0,
    skimStack: 0,
    skimTimer: 0,
    ladder: 0,
    ladderTimer: 0,
    maxChain: 0,
    sprint: -1,
    sprintStart: 0,
    gateX: 0,
    gateKind: G_TIDE,
    courseEnd: cfg.mode === MODE_RIDE ? 15000 : cfg.mode === MODE_RACE ? 7500 : 0,
    cq: zeros(24),
    cqX: zeros(24),
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
    eHint: 0,
    rs: hash2(cfg.seed | 0, 0x5eed) | 0,
    ev: zeros(EV_CAP * EV_STRIDE),
    evN: 0,
    evStale: 0,
    hash: 2166136261,
    stSkims: 0,
    stPerfects: 0,
    stRings: 0,
    stChomps: 0,
    stHits: 0,
    stCoins: 0,
    stDashes: 0,
    stFizz: 0,
    stFrenzies: 0,
    stBounces: 0,
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
    splitSteps: zeros(8),
    finishStep: 0,
    endReason: END_NONE,
  };
  startSprint(s, 0, null);
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

/** Hazard vs an ellipse at (cx, cy) with radii grown by `grow`. art=1 uses art edges, else hitboxes. */
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

function isHazard(t: number): boolean {
  'worklet';
  return t === E_PYLON || t === E_JELLY || t === E_PUFFER || t === E_TORPEDO;
}

/** Left and right art extents of a hazard (u), for skims, badges and float. */
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
// Scoring, chain, frenzy
// ---------------------------------------------------------------------------

export function chainTier(s: SimState): number {
  'worklet';
  const c = s.frenzy > 0 ? s.chain % 12 : s.chain;
  const t = idiv(c, 3);
  return t > 3 ? 3 : t;
}

export function multiplier(s: SimState): number {
  'worklet';
  const m = chainTier(s) + 1;
  const f = s.frenzy > 0 ? m * 2 : m;
  return f > 8 ? 8 : f;
}

function scoringOn(s: SimState): boolean {
  'worklet';
  return s.float === 0 && s.popGrace === 0 && s.reviveShield === 0 && s.phase === PH_PLAY;
}

function addScore(s: SimState, pts: number): void {
  'worklet';
  if (s.frenzy > 0) s.pot += pts;
  else s.score += pts;
}

function addBoost(s: SimState, amt: number): void {
  'worklet';
  if (s.etier < 2) return;
  const before = idiv(s.boost, BOOST_COST);
  s.boost = clampi(s.boost + amt, 0, BOOST_MAX);
  const after = idiv(s.boost, BOOST_COST);
  if (after > before) emit(s, EV_BOOST_SEG, after, 0, 0, 0);
}

function bankPot(s: SimState, reason: number): void {
  'worklet';
  if (s.pot > 0) {
    s.score += s.pot;
    s.banked += s.pot;
    emit(s, EV_FRENZY_END, s.pot, reason, 0, 0);
    s.pot = 0;
  } else if (reason >= 0) {
    emit(s, EV_FRENZY_END, 0, reason, 0, 0);
  }
}

/** A chain event (line, ring, skim, chomp, token, regained scatter). */
function chainEvent(s: SimState): void {
  'worklet';
  const before = chainTier(s);
  const wasFrenzy = s.frenzy > 0;
  s.chain++;
  s.chainTimer = CHAIN_WINDOW;
  if (s.chain > s.maxChain) s.maxChain = s.chain;
  // Frenzy at frenzyAt, then every +12.
  const at = s.frenzyAt;
  if (s.chain === at || (s.chain > at && (s.chain - at) % 12 === 0)) {
    if (!wasFrenzy) {
      s.frenzy = FRENZY_STEPS;
      s.frenzyCount++;
      s.stFrenzies++;
      s.boost = s.etier >= 2 ? BOOST_MAX : s.boost;
      emit(s, EV_FRENZY_START, s.chain, 0, 0, 0);
    } else {
      s.frenzy = FRENZY_STEPS;
    }
    return;
  }
  const after = chainTier(s);
  if (after > before && s.frenzy === 0) emit(s, EV_CHAIN_TIER, after, s.chain, 0, 0);
}

function breakChain(s: SimState, reason: number): void {
  'worklet';
  if (s.chain > 0) emit(s, EV_CHAIN_BREAK, chainTier(s), s.chain, reason, 0);
  if (s.frenzy > 0) {
    s.frenzy = 0;
    bankPot(s, 1);
  }
  s.chain = 0;
  s.chainCoins = 0;
  s.chainTimer = 0;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function startDash(s: SimState): void {
  'worklet';
  s.boost -= BOOST_COST;
  s.dash = DASH_STEPS;
  s.dashBuf = 0;
  s.stDashes++;
  if (s.vy > 200 * Q) s.vy = 200 * Q;
  if (s.vy < -200 * Q) s.vy = -200 * Q;
  emit(s, EV_DASH, s.boost, 0, 0, 0);
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
    s.holdStart = s.step;
    if (s.lastTele >= 0) {
      const r = s.step - s.lastTele;
      if (s.stReactN < 64) s.reactS[s.stReactN] = r;
      s.stReactN++;
      s.stReactSum += r;
      if (r < 4) s.stReactFast++;
      s.lastTele = -1;
    }
    if (s.float > 0) {
      s.float = 0;
      s.floatSteps = 0;
      s.popGrace = POP_GRACE;
      emit(s, EV_FLOAT_POP, s.dist >> 8, s.y >> 8, 0, 0);
    }
    if (s.phase === PH_PLAY && s.vy > 0 && s.dash === 0) {
      s.vy -= 180 * Q + idiv(s.vy * 35, 100);
    }
    return;
  }
  if (kind === IN_RELEASE) {
    if (!s.holding) return;
    s.holding = 0;
    const d = s.step - s.holdStart;
    const b = clampi(d >> 1, 0, 31);
    s.holdHist[b]++;
    if (s.lastTele >= 0) {
      const r = s.step - s.lastTele;
      if (s.stReactN < 64) s.reactS[s.stReactN] = r;
      s.stReactN++;
      s.stReactSum += r;
      if (r < 4) s.stReactFast++;
      s.lastTele = -1;
    }
    if (s.phase === PH_PLAY && s.vy < 0 && s.dash === 0) s.vy += 120 * Q;
    return;
  }
  if (kind === IN_DASH) {
    if (s.etier < 2 || s.phase !== PH_PLAY || s.float > 0) return;
    if (s.dash > 0) return;
    if (s.boost >= BOOST_COST) startDash(s);
    else s.dashBuf = DASH_BUFFER;
    return;
  }
  if (kind === IN_EXT) {
    if (sub === EXT_REVIVE || sub === EXT_RIDE_RESCUE) {
      if (s.phase !== PH_WIPE) return;
      if (sub === EXT_REVIVE && (s.reviveUsed || (s.mode !== MODE_QUEUE && s.mode !== MODE_GHOST && s.mode !== MODE_PRACTICE))) return;
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
      s.stumble = 0;
      emit(s, EV_REVIVE, sub, arg, 0, 0);
      return;
    }
    if (sub === EXT_LINE_BOOST) {
      if (s.mode !== MODE_QUEUE || s.lineBoostSteps >= LINE_BOOST_MAX) return;
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
      if (s.mode !== MODE_RACE && s.mode !== MODE_GHOST) return;
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
    // EXT_PAUSE_RESUME: recorded for plausibility (exact-state resume, QUEUE REALITY).
  }
}

// ---------------------------------------------------------------------------
// Hits
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
  s.hearts--;
  s.stHits++;
  s.iframes = IFRAMES;
  s.stumble = STUMBLE_HOLD + STUMBLE_RAMP;
  // Coin Scatter: 40% of the chain's coins (max 12) fan forward.
  const n = clampi(idiv(s.chainCoins * 4, 10), 0, 12);
  const r = { s: s.rs };
  for (let k = 0; k < n; k++) {
    const j = spawn(s, E_SCATTER, x + 20, y, 0, 0, 0);
    if (j < 0) break;
    s.evx[j] = (rngRange(r, 60, 260)) * Q; // forward (world-relative)
    s.evy[j] = (rngRange(r, 0, 520) - 360) * Q;
  }
  s.rs = r.s;
  if (s.score > 0 && n > 0) {
    const lose = clampi(n * 10, 0, s.score);
    s.score -= lose;
  }
  if (n > 0) emit(s, EV_SCATTER, n, x, y, 0);
  // Frenzy: lose 50% of the pot, bank the rest, end Frenzy.
  if (s.frenzy > 0) {
    s.pot = s.pot - (s.pot >> 1);
    s.frenzy = 0;
    bankPot(s, 2);
  }
  // Chain drops one tier.
  const t = chainTier(s);
  const before = s.chain;
  s.chain = t > 0 ? (t - 1) * 3 : 0;
  if (before > 0) emit(s, EV_CHAIN_BREAK, t, before, 2, s.chain);
  s.chainCoins = 0;
  s.chainTimer = s.chain > 0 ? CHAIN_WINDOW : 0;
  emit(s, EV_HIT, x, y, s.hearts, s.et[i]);
  if (s.hearts <= 0) {
    s.phase = PH_WIPE;
    s.phaseSteps = 0;
    s.holding = 0;
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
    chainEvent(s);
  }
  emit(s, EV_CHOMP, x, y, kind, pts);
  if (s.et[i] === E_BOX) {
    // Spill 5 coins that spray forward, then settle.
    const r = { s: s.rs };
    for (let k = 0; k < 5; k++) {
      const j = spawn(s, E_SCATTER, x, y, 1, 0, 0);
      if (j < 0) break;
      s.evx[j] = rngRange(r, 80, 300) * Q;
      s.evy[j] = (rngRange(r, 0, 500) - 330) * Q;
    }
    s.rs = r.s;
  }
}

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

function speedMulQ8(s: SimState): number {
  'worklet';
  let m = 256;
  if (s.stumble > 0) {
    if (s.stumble > STUMBLE_RAMP) m = 154; // x0.6
    else m = 154 + idiv((256 - 154) * (STUMBLE_RAMP - s.stumble), STUMBLE_RAMP);
  }
  if (s.dash > 0) m = (m * 461) >> 8; // x1.8
  if (s.boostSpeed > 0) m = (m * (256 + s.boostSpeedPct)) >> 8;
  if (s.draft) m = (m * 287) >> 8; // +12%
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
  if (s.chain > 0 || s.frenzy > 0) breakChain(s, which === 0 ? 4 : 5);
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
  if (s.dash > 0) {
    // vy clamped to +-200 and held for the whole dash.
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
  if (s.y < SHARK_MIN_Y * Q) {
    s.y = SHARK_MIN_Y * Q;
    if (s.vy < 0) s.vy = 120 * Q;
    bounce(s, 0);
  } else if (s.y > SHARK_MAX_Y * Q) {
    s.y = SHARK_MAX_Y * Q;
    if (s.vy > 0) s.vy = -420 * Q;
    bounce(s, 1);
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

/** Doom predictor (design 7.4): unavoidable hit within 6 steps under hold AND release. */
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

function updateEntities(s: SimState, du: number, pdu: number): void {
  'worklet';
  const ahead = aheadU(s);
  const spd = s.speedEff >> 8;
  // 600ms of travel at full speed (a Float's slow drift must not shorten it).
  const sb = s.speed >> 8;
  const badgeLead = idiv((spd > sb ? spd : sb) * 6, 10);
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
    if (isHazard(t) && !(s.ef[i] & F_BADGE) && t !== E_TORPEDO) {
      const sp = hazardSpan(s, i);
      if (sp[0] <= du + ahead + badgeLead) {
        s.ef[i] |= F_BADGE;
        emit(s, EV_BADGE, i, t, 0, 0);
        s.lastTele = s.step;
        s.stTele++;
      }
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
      // Bouncing coins (hit scatter or box spill): world-relative motion.
      // Fans ahead, then drifts back toward the shark (catchable, not free).
      s.ex[i] += idiv(s.evx[i], STEP_HZ * Q) + idiv(s.speedEff >> 1, STEP_HZ * Q);
      s.evy[i] += idiv(700 * Q, STEP_HZ);
      s.ey[i] += idiv(s.evy[i], STEP_HZ * Q);
      s.evx[i] -= idiv(s.evx[i], 40);
      if (s.ey[i] > FLOOR_Y - 20) {
        s.ey[i] = FLOOR_Y - 20;
        s.evy[i] = -idiv(s.evy[i] * 6, 10);
      }
      if (s.ey[i] < SURFACE_Y + 20) {
        s.ey[i] = SURFACE_Y + 20;
        s.evy[i] = -s.evy[i];
      }
      if (s.etm[i] >= SCATTER_STEPS) s.et[i] = E_NONE;
      continue;
    }
  }
  void pdu;
}

function skim(s: SimState, i: number): void {
  'worklet';
  s.stSkims++;
  s.skimStack = s.skimTimer > 0 ? clampi(s.skimStack + 1, 1, 4) : 1;
  s.skimTimer = 60;
  if (!scoringOn(s)) return;
  const pts = (s.dash > 0 ? 50 : 25) * multiplier(s);
  addScore(s, pts);
  addBoost(s, 34);
  chainEvent(s);
  const y = s.et[i] === E_JELLY ? jellyY(s, i) : s.ey[i];
  emit(s, EV_SKIM, s.dist >> 8, s.y >> 8, s.skimStack, y);
}

function end(s: SimState, reason: number): void {
  'worklet';
  if (s.phase === PH_DONE) return;
  if (s.frenzy > 0) {
    s.frenzy = 0;
    bankPot(s, 0);
  }
  s.phase = PH_DONE;
  s.endReason = reason;
  emit(s, EV_END, reason, s.score, s.hearts, s.tokens);
}

function gate(s: SimState, i: number): void {
  'worklet';
  const kind = s.ep1[i];
  if (kind === G_SPLIT) {
    const k = clampi(s.gates, 0, 7);
    s.splitSteps[k] = s.step;
    s.gates++;
    emit(s, EV_GATE, 0, kind, s.step, 0);
    return;
  }
  const frenzyNow = s.frenzy > 0;
  const multNow = multiplier(s);
  if (s.frenzy > 0) {
    s.frenzy = 0;
    bankPot(s, 0);
  }
  if (kind === G_FINISH) {
    s.finishStep = s.step;
    end(s, END_FINISH);
    emit(s, EV_GATE, 0, kind, s.step, 0);
    return;
  }
  if (kind === G_RIDE) {
    s.finishStep = s.step;
    end(s, END_GATE);
    emit(s, EV_GATE, 0, kind, s.step, 0);
    return;
  }
  // Tide Gate: clock bonus 4s + (multiplier - 1)s, 8s during Frenzy; 60s cap.
  let bonus = 0;
  if (s.mode === MODE_QUEUE || s.mode === MODE_GHOST || s.mode === MODE_PRACTICE) {
    const want = frenzyNow ? 480 : (4 + (multNow - 1)) * 60;
    const room = CLOCK_CAP - (CLOCK_BASE + s.bonusSteps);
    bonus = clampi(want, 0, room);
    s.bonusSteps += bonus;
    s.clockSteps += bonus;
  }
  const k = clampi(s.gates, 0, 7);
  s.splitSteps[k] = s.step;
  s.gates++;
  emit(s, EV_GATE, bonus, kind, s.step, s.gates);
  s.phase = PH_POCKET;
  s.phaseSteps = 0;
  s.pocketY = s.y;
  // The next sprint streams in now, placed after the pocket's cruise (the
  // speed is constant in a pocket, so this is exact) and its lead-in.
  startSprint(s, s.sprint + 1, null, idiv(idiv(s.speed, STEP_HZ) * s.pocketLen, Q));
  s.float = 0;
  s.dash = 0;
  s.dashBuf = 0;
  s.holding = s.holding;
}

function collide(s: SimState, du: number, pdu: number): void {
  'worklet';
  const sy = s.y >> 8;
  const on = scoringOn(s);
  const safe = s.float > 0 || s.popGrace > 0 || s.reviveShield > 0;
  for (let i = 0; i < ENT_CAP; i++) {
    const t = s.et[i];
    if (t === E_NONE || (s.ef[i] & F_DONE)) continue;
    const dx = s.ex[i] - du;
    if (dx > 320 || dx < -320) continue;
    if (t === E_COIN || t === E_SCATTER) {
      if (!on) continue;
      if (t === E_SCATTER && s.etm[i] < 8) continue;
      const cy = s.ey[i];
      let got = ellipseCircle(du, sy, SHARK_RX + 14, SHARK_RY + 14, s.ex[i], cy, COIN_R);
      if (!got && s.frenzy > 0) {
        const ddy = cy - sy;
        got = dx * dx + ddy * ddy <= 220 * 220;
      }
      if (!got) continue;
      s.ef[i] |= F_DONE;
      s.et[i] = E_NONE;
      s.stCoins++;
      s.chainCoins++;
      addScore(s, 10 * multiplier(s));
      s.ladder = s.ladderTimer > 0 ? clampi(s.ladder + 1, 0, 12) : 0;
      s.ladderTimer = 18;
      if (s.chain > 0 || s.frenzy > 0) s.chainTimer = CHAIN_WINDOW;
      emit(s, EV_COIN, s.ex[i], cy, s.ladder, t === E_SCATTER ? 1 : 0);
      if (t === E_SCATTER && s.ep1[i] === 0) {
        chainEvent(s);
        emit(s, EV_REGAIN, s.ex[i], cy, 0, 0);
      }
      if (t === E_COIN) {
        const g = s.eline[i];
        s.lineGot[g]++;
        if (s.lineGot[g] === s.lineTotal[g] && s.lineTotal[g] >= 3) {
          chainEvent(s);
          emit(s, EV_LINE, s.ex[i], cy, s.lineTotal[g], 0);
        }
      }
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
      addScore(s, (perfect ? 100 : 50) * multiplier(s));
      addBoost(s, perfect ? 50 : 15);
      chainEvent(s);
      if (perfect && (s.mode === MODE_RACE || s.mode === MODE_GHOST)) {
        s.boostSpeed = 36;
        s.boostSpeedPct = 26; // +10%
        emit(s, EV_SPEED_BOOST, 10, 36, 0, 0);
      }
      emit(s, EV_RING, s.ex[i], s.ey[i], perfect ? 1 : 0, d);
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
      addScore(s, 150 * multiplier(s));
      addBoost(s, 50);
      chainEvent(s);
      emit(s, EV_TOKEN, s.ex[i], s.ey[i], slot, s.tokens);
      if (s.tokens === 3) {
        s.score += 500;
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
      if (touching) s.ef[i] |= F_GHOST | F_CLOSE;
      continue;
    }
    if (t === E_PUFFER) {
      const inflated = s.est[i] >= 2 && s.etm[i] >= 4;
      if (touching) {
        if (!inflated || s.dash > 0) {
          chomp(s, i, 60, E_PUFFER);
          continue;
        }
        // Contact grace (5 steps): a Dash inside it turns the hit into a Chomp.
        if (s.ep2[i] === 0) s.ep2[i] = s.step;
        if (s.step - s.ep2[i] >= CONTACT_GRACE) sharkHit(s, i);
        continue;
      }
      s.ep2[i] = 0;
    } else if (touching) {
      sharkHit(s, i);
      if (s.phase !== PH_PLAY) return;
      continue;
    }
    // Honest skims: visible water 2..22u between silhouette and art edge.
    if (!(s.ef[i] & F_CLOSE)) {
      if (hazardTouches(s, i, du, sy, SIL_RX + 2, SIL_RY + 2, true)) s.ef[i] |= F_CLOSE;
      else if (hazardTouches(s, i, du, sy, SIL_RX + 22, SIL_RY + 22, true)) s.ef[i] |= F_SKIMC;
    }
    const sp = hazardSpan(s, i);
    if (sp[1] < du - SIL_RX && !(s.ef[i] & F_DONE)) {
      s.ef[i] |= F_DONE;
      if ((s.ef[i] & F_SKIMC) && !(s.ef[i] & (F_CLOSE | F_HIT | F_GHOST))) skim(s, i);
    }
  }
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
  if (s.phase === PH_WIPE) {
    s.phaseSteps++;
    const canRevive = (s.mode === MODE_QUEUE || s.mode === MODE_GHOST || s.mode === MODE_PRACTICE) && !s.reviveUsed;
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
    s.dist += idiv(s.speed, STEP_HZ);
    const du = s.dist >> 8;
    while (s.cqNext < s.cqN && s.cqX[s.cqNext] <= du + 1500) {
      spawnChunk(s, s.cqNext);
      s.cqNext++;
    }
    updateEntities(s, du, pdu);
    const left = s.pocketLen - s.phaseSteps;
    if (left === 72 || left === 36 || left === 0) emit(s, EV_PIP, left === 72 ? 1 : left === 36 ? 2 : 3, 0, 0, 0);
    if (s.phaseSteps >= s.pocketLen) {
      s.phase = PH_PLAY;
      s.phaseSteps = 0;
      s.vy = 0;
      emit(s, EV_POCKET_END, s.sprint, 0, 0, 0);
    }
    return;
  }

  // --- PLAY ---
  s.activeSteps++;
  if (s.float === 0) s.speedSteps++;
  s.phaseSteps++;
  if (s.mode === MODE_QUEUE || s.mode === MODE_GHOST || s.mode === MODE_PRACTICE) {
    s.clockSteps--;
    if (s.clockSteps <= 300 && s.clockSteps > 0 && s.clockSteps % 60 === 0) emit(s, EV_CLOCK_TICK, idiv(s.clockSteps, 60), 0, 0, 0);
    if (s.clockSteps <= 0) {
      s.clockSteps = 0;
      end(s, END_TIME);
      return;
    }
  }

  // Speed ramp: +4.2 u/s per active second, +25 per gate, capped.
  const sp = s.speedBase + idiv(s.speedSteps * 42 * Q, 600) + s.gates * 25 * Q;
  s.speed = sp > s.speedCap ? s.speedCap : sp;

  // Bubble Float: arms after 1.8s without a touch-down, when nothing is near.
  if (s.float === 1) {
    s.floatSteps++;
    if (s.floatSteps >= FLOAT_FREEZE) {
      s.float = 2;
      emit(s, EV_FREEZE, 0, 0, 0, 0);
      return;
    }
  } else if (!s.holding && s.activeSteps > 180 && s.step - s.lastPress >= FLOAT_ARM && s.dash === 0
    && s.popGrace === 0 && s.reviveShield === 0) {
    if (!hazardAhead(s, (s.speed >> 8) + 100)) {
      s.float = 1;
      s.floatSteps = 0;
      emit(s, EV_FLOAT_IN, s.dist >> 8, s.y >> 8, 0, 0);
    }
  }

  // Timers.
  if (s.iframes > 0) s.iframes--;
  if (s.stumble > 0) s.stumble--;
  if (s.popGrace > 0) s.popGrace--;
  if (s.reviveShield > 0) s.reviveShield--;
  if (s.boostSpeed > 0) s.boostSpeed--;
  if (s.skimTimer > 0) s.skimTimer--;
  if (s.ladderTimer > 0) s.ladderTimer--;
  if (s.doomCool > 0) s.doomCool--;
  if (s.dash > 0) {
    s.dash--;
  } else if (s.dashBuf > 0) {
    if (s.boost >= BOOST_COST) startDash(s);
    else {
      s.dashBuf--;
      if (s.dashBuf === 0) {
        s.stFizz++;
        emit(s, EV_FIZZ, s.boost, 0, 0, 0);
      }
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
  if (s.float === 0 && s.phase === PH_PLAY) {
    if (s.frenzy > 0) {
      s.frenzy--;
      if (s.frenzy === 0) {
        bankPot(s, 0);
        s.chainTimer = CHAIN_WINDOW;
      }
    } else if (s.chainTimer > 0) {
      s.chainTimer--;
      if (s.chainTimer === 0) breakChain(s, 0);
    }
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

  updateEntities(s, du, pdu);
  collide(s, du, pdu);
  if (s.phase !== PH_PLAY) return;

  // Distance points: 1 per 10u (not in Float).
  if (s.float === 0 && s.reviveShield === 0) {
    s.distAcc += du - pdu;
    while (s.distAcc >= 10) {
      s.distAcc -= 10;
      addScore(s, 1);
    }
  }

  // Ride win beat: the Ride Gate is about to enter view.
  if (s.gateKind === G_RIDE && !s.gateNear && s.gateX - du <= aheadU(s)) {
    s.gateNear = 1;
    emit(s, EV_GATE_NEAR, s.gateX, 0, 0, 0);
  }

  // Doom slow-mo (presentation) when the next hit is unavoidable and fatal.
  if (s.hearts === 1 && !s.shield && s.iframes === 0 && s.float === 0 && s.popGrace === 0 && s.doomCool === 0
    && s.dash === 0 && s.reviveShield === 0 && (s.reviveUsed || s.mode === MODE_RIDE || s.mode === MODE_RACE)) {
    if (doomCheck(s)) {
      s.doomCool = 60;
      emit(s, EV_DOOM, du, s.y >> 8, 0, 0);
    }
  }

  if (s.phaseSteps % 6 === 0) emit(s, EV_SCORE, s.score, s.pot, 0, 0);
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
    let shift = 0;
    while (p < bytes.length) {
      const b = bytes[p++];
      x += (b & 0x7f) * Math.pow(2, shift);
      shift += 7;
      if (!(b & 0x80)) break;
    }
    return x;
  };
  while (p < bytes.length) {
    const v = readVar();
    const kind = v & 3;
    step += Math.floor(v / 4);
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
// Plausibility (design 11.4): flags for review, never a rejection by itself.
// ---------------------------------------------------------------------------

export interface Plausibility {
  reactN: number;
  reactMeanSteps: number;
  reactFast: number;
  holdEntropyBits: number;
  perfectTightRatio: number;
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
  return {
    reactN: s.stReactN,
    reactMeanSteps: mean,
    reactFast: s.stReactFast,
    holdEntropyBits: ent,
    perfectTightRatio: ratio,
    flagged: reasons.length > 0,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Bot policy: house-crew racers, tests and chunk gates. Integer only.
// ---------------------------------------------------------------------------

export interface BotBrain {
  /** Steps between input changes (human ~7). */
  cadence: number;
  /** Perception delay in steps (the world it plans on is this old). */
  delay: number;
  /** Target-y noise (u). */
  noise: number;
  /** Uses Dash when boost is ready and a Puffer or skim line is near. */
  dasher: boolean;
  /** Dashes the moment the meter allows (spam policy for the race test). */
  spam: boolean;
  r: { s: number };
  next: number;
  wantHold: number;
  targetY: number;
}

export function createBrain(seed: number, cadence: number, delay: number, noise: number, dasher: boolean, spam: boolean): BotBrain {
  'worklet';
  return { cadence, delay, noise, dasher, spam, r: { s: seed | 0 }, next: 0, wantHold: 0, targetY: 500 };
}

/** Best y to aim for given the hazards ahead (u). Deterministic heuristic. */
export function botTargetY(s: SimState, lookU: number): number {
  'worklet';
  const du = s.dist >> 8;
  let best = -1;
  let bestX = 1e9;
  // Nearest unresolved hazard or pickup line ahead.
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
  if (best < 0) {
    // Follow coins / rings.
    let cy = 500;
    let cx = 1e9;
    for (let i = 0; i < ENT_CAP; i++) {
      const t = s.et[i];
      if (t !== E_COIN && t !== E_RING && t !== E_TOKEN) continue;
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
  if (t === E_PYLON) return s.ey[best];
  // Circles and torpedoes: pick the side with more room, considering neighbours.
  const hy = t === E_JELLY ? jellyY(s, best) : s.ey[best];
  const r = t === E_JELLY ? JELLY_R : t === E_PUFFER ? PUFF_R1 : TORP_H >> 1;
  const above = hy - r - SHARK_RY - 40;
  const below = hy + r + SHARK_RY + 40;
  // Check the other hazards in the same x band.
  let upOk = above > SHARK_MIN_Y + 10;
  let downOk = below < SHARK_MAX_Y - 10;
  for (let i = 0; i < ENT_CAP; i++) {
    if (i === best) continue;
    const t2 = s.et[i];
    if (!isHazard(t2) || (s.ef[i] & (F_HIT | F_DONE))) continue;
    if (absi(s.ex[i] - s.ex[best]) > 220) continue;
    const y2 = t2 === E_JELLY ? jellyY(s, i) : t2 === E_PYLON ? -1 : s.ey[i];
    if (t2 === E_PYLON) continue;
    const r2 = t2 === E_JELLY ? JELLY_R : t2 === E_PUFFER ? PUFF_R1 : TORP_H >> 1;
    if (absi(y2 - above) < r2 + SHARK_RY + 20) upOk = false;
    if (absi(y2 - below) < r2 + SHARK_RY + 20) downOk = false;
  }
  const sy = s.y >> 8;
  if (upOk && downOk) return absi(sy - above) < absi(sy - below) ? above : below;
  if (upOk) return above;
  if (downOk) return below;
  return absi(sy - above) < absi(sy - below) ? above : below;
}

/**
 * One bot decision for the current step. Returns inputs to apply as a small
 * list of kinds (press/release/dash). Uses its own RNG so bots replay.
 */
export function botDecide(s: SimState, b: BotBrain, out: number[]): number {
  'worklet';
  let n = 0;
  if (s.phase !== PH_PLAY) {
    if (s.phase === PH_POCKET && s.holding) {
      out[n++] = IN_RELEASE;
    }
    return n;
  }
  if (s.step < b.next) return 0;
  b.next = s.step + b.cadence;
  const sf = speedFrac(s);
  const look = (s.speed >> 8) + 60 + ((sf * 80) >> 8);
  let ty = botTargetY(s, look);
  if (b.noise > 0) ty += rngRange(b.r, -b.noise, b.noise);
  b.targetY = ty;
  // Predict where we'll be after `delay + cadence` steps with a simple lead.
  const lead = b.delay + b.cadence;
  const py = (s.y >> 8) + idiv(idiv(s.vy, Q) * lead, STEP_HZ);
  const want = py > ty ? 1 : 0;
  if (want && !s.holding) out[n++] = IN_PRESS;
  if (!want && s.holding) out[n++] = IN_RELEASE;
  if (b.dasher && s.etier >= 2 && s.dash === 0 && s.boost >= BOOST_COST) {
    if (b.spam) out[n++] = IN_DASH;
    else {
      // Dash through an inflated puffer we're about to hit, or on a clear straight.
      const du = s.dist >> 8;
      for (let i = 0; i < ENT_CAP; i++) {
        if (s.et[i] !== E_PUFFER || s.est[i] < 1 || s.est[i] >= 4) continue;
        const dx = s.ex[i] - du;
        if (dx > 40 && dx < 200 && absi(s.ey[i] - (s.y >> 8)) < 90) {
          out[n++] = IN_DASH;
          break;
        }
      }
      if (n === 0 || out[n - 1] !== IN_DASH) {
        if (s.boost >= BOOST_MAX && !hazardAhead(s, 500)) out[n++] = IN_DASH;
      }
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Test and tooling helpers (also worklet-safe)
// ---------------------------------------------------------------------------

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
  s.gateX = x + 160;
  s.gateKind = G_TIDE;
  spawn(s, E_GATE, s.gateX, 500, G_TIDE, 0, 0);
}

// ---------------------------------------------------------------------------
// Fast lookahead planner (bots): shark-only physics against predicted hazard
// positions. No state cloning, so a house-crew racer plans a whole run in a
// few ms. Conservative: puffers count as inflated, tracking torpedoes as
// locked on their current lane.
// ---------------------------------------------------------------------------

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
    if (x - cx > 220 || x - cx < -220) continue;
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
 * budget. Deterministic.
 */
export function planHold(s: SimState, every: number, horizon: number, budget: number, prefer: number): number {
  'worklet';
  const sf = speedFrac(s);
  // Q8 advance per step; a running Dash holds vy and moves x1.8 until it ends.
  const advNow = idiv(s.speedEff, STEP_HZ);
  const advAfter = s.dash > 0 ? idiv(advNow * 256, 461) : advNow;
  const dashLeft = s.dash;
  const thrust = idiv(-(2600 + ((650 * sf) >> 8)) * Q, STEP_HZ);
  const sink = idiv((1900 + ((285 * sf) >> 8)) * Q, STEP_HZ);
  const minY = SHARK_MIN_Y * Q;
  const maxY = SHARK_MAX_Y * Q;
  // Explicit DFS stack: [y, vy, holding, k(steps so far), choiceIdx, firstChoice, rootChoice]
  const sy: number[] = [];
  const svy: number[] = [];
  const sh: number[] = [];
  const sk: number[] = [];
  const sc: number[] = [];
  let nodes = 0;
  sy.push(s.y); svy.push(s.vy); sh.push(s.holding); sk.push(0); sc.push(0);
  const rootFirst = prefer;
  let rootChoice = -1;
  while (sy.length > 0) {
    const top = sy.length - 1;
    if (sc[top] >= 2) {
      sy.pop(); svy.pop(); sh.pop(); sk.pop(); sc.pop();
      continue;
    }
    const choice = sc[top] === 0 ? prefer : 1 - prefer;
    sc[top]++;
    if (top === 0) rootChoice = sc[top] === 1 ? rootFirst : 1 - rootFirst;
    if (++nodes > budget) return -1;
    let y = sy[top];
    let vy = svy[top];
    let holding = sh[top];
    const k0 = sk[top];
    // Input edge kicks.
    const dashing = k0 < dashLeft;
    if (choice === 1 && !holding) {
      if (vy > 0 && !dashing) vy -= 180 * Q + idiv(vy * 35, 100);
      holding = 1;
    } else if (choice === 0 && holding) {
      if (vy < 0 && !dashing) vy += 120 * Q;
      holding = 0;
    }
    let hit = false;
    for (let j = 1; j <= every; j++) {
      const kk = k0 + j;
      if (kk <= dashLeft) {
        y += idiv(vy, STEP_HZ);
      } else {
        const accel = holding ? thrust : sink;
        if ((accel < 0 && vy > 0) || (accel > 0 && vy < 0)) vy -= idiv(vy * 3, 64);
        vy = clampi(vy + accel, -720 * Q, 820 * Q);
        y += idiv(vy, STEP_HZ);
      }
      if (y < minY) {
        y = minY;
        if (vy < 0) vy = 120 * Q;
      } else if (y > maxY) {
        y = maxY;
        if (vy > 0) vy = -420 * Q;
      }
      const k = k0 + j;
      const cx = (s.dist + (k <= dashLeft ? advNow * k : advNow * dashLeft + advAfter * (k - dashLeft))) >> 8;
      if (touchesAhead(s, cx, y >> 8, k, k)) {
        hit = true;
        break;
      }
    }
    if (hit) continue;
    const depth = idiv(k0 + every, every);
    if (depth >= horizon) return top === 0 ? choice : rootChoice;
    sy.push(y); svy.push(vy); sh.push(holding); sk.push(k0 + every); sc.push(0);
  }
  return -1;
}
