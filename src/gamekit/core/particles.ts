/**
 * particles.ts: the studio particle simulation (pure, worklet-safe).
 *
 * Struct-of-arrays pool of plain number arrays: allocation-free per frame,
 * lives on the UI thread inside a SharedValue, and runs unchanged in node
 * tests. Rendering (one Skia <Atlas> draw) is in fx/FxStage.tsx; this file
 * only knows sprite indices (FX_SPRITE) and numbers.
 *
 * Features: emitters with cones/spread, gravity, drag, spin, velocity-aligned
 * sparks, confetti flutter (foreshortened frames), floor bounces, coins that
 * magnetize to a HUD target (counting arrivals for ticks/haptics), size and
 * alpha curves, priority classes and oldest-first culling when full, and
 * per-layer budgets (game / party / celebration).
 */

import { createRng, rngFloat, type Rng } from './rng';

// =============================================================================
// Sprite indices in the shared FX atlas (see fx/FxAtlas.ts for the art).
// =============================================================================

export const FX_SPRITE = {
  dot: 0,
  softDot: 1,
  ring: 2,
  streak: 3,
  droplet: 4,
  glint: 5,
  star: 6,
  starArt: 7,
  sparkArt: 8,
  coin: 9,
  bubble: 10,
  splash: 11,
  inkBlob: 12,
  puff: 13,
  shard: 14,
  heart: 15,
  /** 4 foreshortened frames for flutter: confetti rect (16..19). */
  confetti: 16,
  /** 4 frames: ribbon curl (20..23). */
  ribbon: 20,
  /** 4 frames: coin flip (24..27). */
  coinFlip: 24,
  sparkle: 28,
  impactStar: 29,
  speedLine: 30,
  ember: 31,
} as const;

export const FX_SPRITE_COUNT = 32;

/** Particle priority classes: higher survives culling. */
export const PRIO = {
  ambient: 0,
  minor: 1,
  hit: 2,
  major: 3,
} as const;

/** Layer budgets (Line Party spec: game 320 / party 160 / celebration 160). */
export const LAYER = {
  game: 0,
  party: 1,
  celebration: 2,
} as const;

// =============================================================================
// Pool
// =============================================================================

export interface ParticlePool {
  cap: number;
  live: number;
  seq: number;
  rng: Rng;
  /** Coins that reached their magnet target since the last read. */
  arrivals: number;
  layerBudget: number[];
  layerLive: number[];
  alive: number[];
  x: number[];
  y: number[];
  vx: number[];
  vy: number[];
  rot: number[];
  vrot: number[];
  size0: number[];
  size1: number[];
  age: number[];
  life: number[];
  grav: number[];
  drag: number[];
  sprite: number[];
  frames: number[];
  phase: number[];
  phaseRate: number[];
  align: number[];
  color: number[];
  fadeIn: number[];
  fadeOut: number[];
  prio: number[];
  layer: number[];
  born: number[];
  floorY: number[];
  bounce: number[];
  bounces: number[];
  tx: number[];
  ty: number[];
  magnetAt: number[];
  magnetDur: number[];
  mx0: number[];
  my0: number[];
  /** Per-particle local clock scale (0 = frozen by a local hit-stop). */
  slot: number[];
}

function nums(n: number, v = 0): number[] {
  'worklet';
  const a: number[] = [];
  for (let i = 0; i < n; i++) a.push(v);
  return a;
}

export function createParticlePool(cap = 200, seed = 7, layerBudget?: number[]): ParticlePool {
  'worklet';
  return {
    cap,
    live: 0,
    seq: 0,
    rng: createRng(seed),
    arrivals: 0,
    layerBudget: layerBudget ?? [cap, cap, cap],
    layerLive: [0, 0, 0],
    alive: nums(cap),
    x: nums(cap),
    y: nums(cap),
    vx: nums(cap),
    vy: nums(cap),
    rot: nums(cap),
    vrot: nums(cap),
    size0: nums(cap),
    size1: nums(cap),
    age: nums(cap),
    life: nums(cap, 1),
    grav: nums(cap),
    drag: nums(cap),
    sprite: nums(cap),
    frames: nums(cap, 1),
    phase: nums(cap),
    phaseRate: nums(cap),
    align: nums(cap),
    color: nums(cap, 0xffffffff),
    fadeIn: nums(cap),
    fadeOut: nums(cap),
    prio: nums(cap),
    layer: nums(cap),
    born: nums(cap),
    floorY: nums(cap, 1e9),
    bounce: nums(cap),
    bounces: nums(cap),
    tx: nums(cap),
    ty: nums(cap),
    magnetAt: nums(cap, -1),
    magnetDur: nums(cap),
    mx0: nums(cap),
    my0: nums(cap),
    slot: nums(cap, -1),
  };
}

// =============================================================================
// Emitter definitions
// =============================================================================

export interface EmitterDef {
  sprite: number;
  /** Frames for flutter/flip animation (consecutive sprite indices). */
  frames?: number;
  count: [number, number];
  /** px/s */
  speed: [number, number];
  /** Degrees; -90 is up. */
  angle: number;
  /** Degrees of total cone; 360 = radial. */
  spread: number;
  /** Seconds. */
  life: [number, number];
  /** Half-size in px. */
  size: [number, number];
  /** End size multiplier. */
  sizeEnd: number;
  gravity: number;
  /** Linear drag per second. */
  drag: number;
  /** deg/s */
  spin: [number, number];
  /** Rotate to face velocity (sparks, droplets, speed lines). */
  align?: boolean;
  /** Flutter/flip rate in rad/s (uses frames). */
  flutter?: [number, number];
  fadeIn: number;
  fadeOut: number;
  prio: number;
  /** Default tints (packed ARGB); one is picked per particle. 0xffffffff = art as drawn. */
  colors: number[];
  /** Spawn radius jitter (px). */
  jitter: number;
  /** Floor bounce restitution (0 = none). */
  bounce?: number;
  bounces?: number;
}

/** Pack a hex colour (#rgb, #rrggbb, #aarrggbb-free) and alpha into ARGB. */
export function packHex(hex: string, alpha = 1): number {
  'worklet';
  let h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  const rgb = parseInt(h.slice(0, 6), 16) >>> 0;
  const a = Math.round((alpha < 0 ? 0 : alpha > 1 ? 1 : alpha) * 255);
  return ((a << 24) | rgb) >>> 0;
}

const WHITE = 0xffffffff;
/** Brand tints (bright world: no dark, neon or purple). */
export const TINT = {
  white: WHITE,
  gold: 0xffffcf3b,
  goldDeep: 0xfffec90e,
  blue: 0xff00a5f5,
  sky: 0xffbfe5ff,
  teal: 0xff1fc8b8,
  coral: 0xffff6b5c,
  cream: 0xfffff8e4,
  green: 0xff3cb85c,
  water: 0xff46c3d1,
  ink: 0xff2f2f3a,
} as const;

const CONFETTI_COLORS = [TINT.gold, TINT.blue, TINT.coral, TINT.teal, TINT.white, TINT.green];

/**
 * Preset emitters. Games tune by passing overrides at emit time, or by
 * spreading a preset into their own def.
 */
export const EMITTERS = {
  /** Tiny glints for LATE-tier hits and pickups. */
  glints: {
    sprite: FX_SPRITE.glint, count: [3, 4], speed: [120, 220], angle: -90, spread: 360,
    life: [0.22, 0.32], size: [5, 8], sizeEnd: 0.3, gravity: 200, drag: 3, spin: [-180, 180],
    fadeIn: 0, fadeOut: 0.5, prio: PRIO.minor, colors: [WHITE], jitter: 4,
  },
  /** Outlined stars: the GOOD hit tier. */
  stars: {
    sprite: FX_SPRITE.starArt, count: [6, 6], speed: [240, 380], angle: -90, spread: 150,
    life: [0.36, 0.44], size: [9, 13], sizeEnd: 0.35, gravity: 900, drag: 1.2, spin: [-420, 420],
    fadeIn: 0, fadeOut: 0.35, prio: PRIO.hit, colors: [WHITE], jitter: 6,
  },
  /** Velocity-aligned sparks (crit, boss hits, electric). */
  sparks: {
    sprite: FX_SPRITE.streak, count: [8, 12], speed: [380, 620], angle: -90, spread: 360,
    life: [0.18, 0.3], size: [10, 16], sizeEnd: 0.2, gravity: 400, drag: 4, spin: [0, 0], align: true,
    fadeIn: 0, fadeOut: 0.4, prio: PRIO.hit, colors: [TINT.gold, WHITE], jitter: 2,
  },
  /** Chunky outlined confetti with flutter. */
  confetti: {
    sprite: FX_SPRITE.confetti, frames: 4, count: [24, 32], speed: [260, 520], angle: -90, spread: 110,
    life: [1.6, 2.4], size: [7, 10], sizeEnd: 0.9, gravity: 600, drag: 1.8, spin: [-360, 360],
    flutter: [6, 12], fadeIn: 0, fadeOut: 0.25, prio: PRIO.major, colors: CONFETTI_COLORS, jitter: 10,
  },
  /** Ribbon curls for celebrations. */
  ribbons: {
    sprite: FX_SPRITE.ribbon, frames: 4, count: [8, 12], speed: [240, 460], angle: -90, spread: 100,
    life: [1.6, 2.2], size: [10, 14], sizeEnd: 0.9, gravity: 520, drag: 1.6, spin: [-200, 200],
    flutter: [5, 9], fadeIn: 0, fadeOut: 0.25, prio: PRIO.major, colors: CONFETTI_COLORS, jitter: 10,
  },
  /** Alex coins: burst up, bounce once, optionally magnetize to the HUD. */
  coins: {
    sprite: FX_SPRITE.coinFlip, frames: 4, count: [12, 16], speed: [380, 620], angle: -90, spread: 80,
    life: [1.4, 1.8], size: [11, 14], sizeEnd: 1, gravity: 1100, drag: 0.4, spin: [0, 0],
    flutter: [10, 16], fadeIn: 0, fadeOut: 0.08, prio: PRIO.major, colors: [WHITE], jitter: 6,
    bounce: 0.35, bounces: 1,
  },
  /** Water splash: droplets aligned to velocity plus a crown. */
  splash: {
    sprite: FX_SPRITE.droplet, count: [10, 14], speed: [260, 520], angle: -90, spread: 120,
    life: [0.45, 0.7], size: [6, 10], sizeEnd: 0.5, gravity: 1400, drag: 0.8, spin: [0, 0], align: true,
    fadeIn: 0, fadeOut: 0.3, prio: PRIO.hit, colors: [WHITE], jitter: 6,
  },
  /** Ink splat blobs (boss ink, splat telegraphs). */
  ink: {
    sprite: FX_SPRITE.inkBlob, count: [8, 12], speed: [160, 420], angle: -90, spread: 360,
    life: [0.5, 0.8], size: [6, 14], sizeEnd: 0.6, gravity: 700, drag: 2.2, spin: [-90, 90],
    fadeIn: 0, fadeOut: 0.35, prio: PRIO.hit, colors: [TINT.ink], jitter: 8,
  },
  bubbles: {
    sprite: FX_SPRITE.bubble, count: [3, 5], speed: [30, 80], angle: -90, spread: 50,
    life: [0.7, 1.2], size: [4, 8], sizeEnd: 1.2, gravity: -160, drag: 1, spin: [0, 0],
    fadeIn: 0.1, fadeOut: 0.3, prio: PRIO.ambient, colors: [WHITE], jitter: 8,
  },
  puff: {
    sprite: FX_SPRITE.puff, count: [4, 6], speed: [40, 120], angle: -90, spread: 360,
    life: [0.35, 0.55], size: [10, 16], sizeEnd: 1.6, gravity: -60, drag: 3, spin: [-60, 60],
    fadeIn: 0, fadeOut: 0.6, prio: PRIO.minor, colors: [WHITE], jitter: 6,
  },
  shards: {
    sprite: FX_SPRITE.shard, count: [6, 8], speed: [220, 420], angle: -90, spread: 200,
    life: [0.5, 0.75], size: [6, 10], sizeEnd: 0.8, gravity: 1300, drag: 0.6, spin: [-720, 720],
    fadeIn: 0, fadeOut: 0.3, prio: PRIO.hit, colors: [WHITE], jitter: 4,
  },
  embers: {
    sprite: FX_SPRITE.ember, count: [10, 16], speed: [60, 180], angle: -90, spread: 70,
    life: [0.6, 1.1], size: [3, 6], sizeEnd: 0.2, gravity: -220, drag: 1.4, spin: [-90, 90],
    fadeIn: 0.1, fadeOut: 0.5, prio: PRIO.minor, colors: [TINT.gold, TINT.coral, 0xffffe07a], jitter: 10,
  },
  /** Dragged trail motes: call every frame while moving. */
  trail: {
    sprite: FX_SPRITE.softDot, count: [2, 3], speed: [10, 40], angle: 0, spread: 360,
    life: [0.25, 0.4], size: [4, 7], sizeEnd: 0.1, gravity: 0, drag: 3, spin: [0, 0],
    fadeIn: 0, fadeOut: 0.7, prio: PRIO.ambient, colors: [WHITE], jitter: 2,
  },
  /** Radial speed lines (golden, fever slam). */
  speedLines: {
    sprite: FX_SPRITE.speedLine, count: [12, 16], speed: [700, 900], angle: 0, spread: 360,
    life: [0.2, 0.26], size: [18, 26], sizeEnd: 1.6, gravity: 0, drag: 2, spin: [0, 0], align: true,
    fadeIn: 0, fadeOut: 0.5, prio: PRIO.major, colors: [WHITE], jitter: 30,
  },
  sparkles: {
    sprite: FX_SPRITE.sparkle, count: [6, 10], speed: [60, 200], angle: -90, spread: 360,
    life: [0.5, 0.9], size: [6, 11], sizeEnd: 0.2, gravity: 0, drag: 2, spin: [-120, 120],
    fadeIn: 0.15, fadeOut: 0.4, prio: PRIO.minor, colors: [WHITE], jitter: 16,
  },
  /** One impact star decal (QUICK / crit): scales up then shrinks. */
  impact: {
    sprite: FX_SPRITE.impactStar, count: [1, 1], speed: [0, 0], angle: 0, spread: 0,
    life: [0.09, 0.09], size: [22, 22], sizeEnd: 2.1, gravity: 0, drag: 0, spin: [-20, 20],
    fadeIn: 0, fadeOut: 0.3, prio: PRIO.major, colors: [WHITE], jitter: 0,
  },
  hearts: {
    sprite: FX_SPRITE.heart, count: [4, 6], speed: [80, 180], angle: -90, spread: 60,
    life: [0.8, 1.1], size: [8, 11], sizeEnd: 0.8, gravity: -120, drag: 1.2, spin: [-60, 60],
    fadeIn: 0.1, fadeOut: 0.4, prio: PRIO.minor, colors: [WHITE], jitter: 8,
  },
} satisfies Record<string, EmitterDef>;

export type EmitterName = keyof typeof EMITTERS;

export interface EmitParams {
  count?: number;
  /** Override cone centre (degrees) and spread. */
  angle?: number;
  spread?: number;
  /** Speed multiplier. */
  speed?: number;
  /** Size multiplier. */
  size?: number;
  /** Single tint for all particles (packed ARGB). */
  color?: number;
  layer?: number;
  /** Magnetize to this point after `magnetDelay` s, over `magnetDur` s. */
  tx?: number;
  ty?: number;
  magnetDelay?: number;
  magnetDur?: number;
  /** Floor for bounces (px); defaults to spawn y + 60 for bouncing defs. */
  floorY?: number;
  /** Local hit-stop slot this burst belongs to (-1 none). */
  slot?: number;
}

function rr(r: Rng, lo: number, hi: number): number {
  'worklet';
  return lo + (hi - lo) * rngFloat(r);
}

/** Find a slot: a free one, else cull the lowest-priority oldest (if lower than prio). */
function claim(pool: ParticlePool, prio: number, layer: number): number {
  'worklet';
  const overLayer = pool.layerLive[layer] >= pool.layerBudget[layer];
  if (!overLayer && pool.live < pool.cap) {
    for (let n = 0; n < pool.cap; n++) {
      const i = (pool.seq + n) % pool.cap;
      if (pool.alive[i] === 0) return i;
    }
  }
  // Full (or layer over budget): evict lowest priority, oldest first.
  let victim = -1;
  let vPrio = 1e9;
  let vBorn = 1e18;
  for (let i = 0; i < pool.cap; i++) {
    if (pool.alive[i] === 0) continue;
    if (overLayer && pool.layer[i] !== layer) continue;
    const p = pool.prio[i];
    if (p < vPrio || (p === vPrio && pool.born[i] < vBorn)) {
      victim = i;
      vPrio = p;
      vBorn = pool.born[i];
    }
  }
  if (victim < 0 || vPrio > prio) return -1;
  kill(pool, victim);
  return victim;
}

function kill(pool: ParticlePool, i: number): void {
  'worklet';
  if (pool.alive[i] === 0) return;
  pool.alive[i] = 0;
  pool.live -= 1;
  pool.layerLive[pool.layer[i]] -= 1;
}

/** Emit particles from a def at (x, y). Returns how many were spawned. */
export function emit(pool: ParticlePool, def: EmitterDef, x: number, y: number, p: EmitParams = {}): number {
  'worklet';
  const r = pool.rng;
  const count = p.count !== undefined ? p.count : Math.round(rr(r, def.count[0], def.count[1]));
  const angle = ((p.angle !== undefined ? p.angle : def.angle) * Math.PI) / 180;
  const spread = ((p.spread !== undefined ? p.spread : def.spread) * Math.PI) / 180;
  const speedMul = p.speed !== undefined ? p.speed : 1;
  const sizeMul = p.size !== undefined ? p.size : 1;
  const layer = p.layer !== undefined ? p.layer : LAYER.game;
  const magnet = p.tx !== undefined && p.ty !== undefined;
  let spawned = 0;
  for (let n = 0; n < count; n++) {
    const i = claim(pool, def.prio, layer);
    if (i < 0) break;
    pool.alive[i] = 1;
    pool.live += 1;
    pool.layerLive[layer] += 1;
    pool.seq += 1;
    pool.born[i] = pool.seq;
    const a = angle + (rngFloat(r) - 0.5) * spread;
    const sp = rr(r, def.speed[0], def.speed[1]) * speedMul;
    const jr = def.jitter * Math.sqrt(rngFloat(r));
    const ja = rngFloat(r) * Math.PI * 2;
    pool.x[i] = x + Math.cos(ja) * jr;
    pool.y[i] = y + Math.sin(ja) * jr;
    pool.vx[i] = Math.cos(a) * sp;
    pool.vy[i] = Math.sin(a) * sp;
    pool.rot[i] = def.align ? a : rngFloat(r) * Math.PI * 2;
    pool.vrot[i] = (rr(r, def.spin[0], def.spin[1]) * Math.PI) / 180;
    const s = rr(r, def.size[0], def.size[1]) * sizeMul;
    pool.size0[i] = s;
    pool.size1[i] = s * def.sizeEnd;
    pool.age[i] = 0;
    pool.life[i] = rr(r, def.life[0], def.life[1]);
    pool.grav[i] = def.gravity;
    pool.drag[i] = def.drag;
    pool.sprite[i] = def.sprite;
    pool.frames[i] = def.frames ?? 1;
    pool.phase[i] = rngFloat(r) * Math.PI * 2;
    pool.phaseRate[i] = def.flutter ? rr(r, def.flutter[0], def.flutter[1]) : 0;
    pool.align[i] = def.align ? 1 : 0;
    pool.color[i] = p.color !== undefined ? p.color : def.colors[Math.floor(rngFloat(r) * def.colors.length)];
    pool.fadeIn[i] = def.fadeIn;
    pool.fadeOut[i] = def.fadeOut;
    pool.prio[i] = def.prio;
    pool.layer[i] = layer;
    pool.bounce[i] = def.bounce ?? 0;
    pool.bounces[i] = def.bounces ?? 0;
    pool.floorY[i] = def.bounce ? (p.floorY !== undefined ? p.floorY : y + 60) : 1e9;
    pool.slot[i] = p.slot !== undefined ? p.slot : -1;
    pool.mx0[i] = 0;
    pool.my0[i] = 0;
    if (magnet) {
      pool.tx[i] = p.tx as number;
      pool.ty[i] = p.ty as number;
      pool.magnetAt[i] = (p.magnetDelay ?? 0.3) + n * 0.02;
      pool.magnetDur[i] = p.magnetDur ?? 0.45;
      // Magnetized particles must live until they arrive.
      const need = pool.magnetAt[i] + pool.magnetDur[i] + 0.05;
      if (pool.life[i] < need) pool.life[i] = need;
    } else {
      pool.magnetAt[i] = -1;
    }
    spawned += 1;
  }
  return spawned;
}

/**
 * Advance the pool. `slotFrozen(slot)` style local hit-stop is supported via
 * `frozenSlots`: an array where frozenSlots[slot] = 1 holds that slot's FX.
 */
export function stepParticles(pool: ParticlePool, dtSec: number, frozenSlots?: number[]): void {
  'worklet';
  if (pool.live === 0 || dtSec <= 0) return;
  for (let i = 0; i < pool.cap; i++) {
    if (pool.alive[i] === 0) continue;
    const sl = pool.slot[i];
    if (sl >= 0 && frozenSlots && frozenSlots[sl] === 1) continue;
    pool.age[i] += dtSec;
    const age = pool.age[i];
    if (age >= pool.life[i]) {
      if (pool.magnetAt[i] >= 0) pool.arrivals += 1;
      kill(pool, i);
      continue;
    }
    pool.phase[i] += pool.phaseRate[i] * dtSec;
    if (pool.magnetAt[i] >= 0 && age >= pool.magnetAt[i]) {
      // Magnet: ease from the capture point to the target.
      if (pool.mx0[i] === 0 && pool.my0[i] === 0) {
        pool.mx0[i] = pool.x[i];
        pool.my0[i] = pool.y[i];
      }
      const t = (age - pool.magnetAt[i]) / pool.magnetDur[i];
      if (t >= 1) {
        pool.arrivals += 1;
        pool.mx0[i] = 0;
        pool.my0[i] = 0;
        kill(pool, i);
        continue;
      }
      const e = t * t * t;
      pool.x[i] = pool.mx0[i] + (pool.tx[i] - pool.mx0[i]) * e;
      pool.y[i] = pool.my0[i] + (pool.ty[i] - pool.my0[i]) * e;
      pool.rot[i] += pool.vrot[i] * dtSec;
      continue;
    }
    pool.vy[i] += pool.grav[i] * dtSec;
    const d = pool.drag[i];
    if (d > 0) {
      const f = 1 - d * dtSec;
      const k = f < 0 ? 0 : f;
      pool.vx[i] *= k;
      pool.vy[i] *= k;
    }
    pool.x[i] += pool.vx[i] * dtSec;
    pool.y[i] += pool.vy[i] * dtSec;
    if (pool.y[i] > pool.floorY[i] && pool.vy[i] > 0) {
      if (pool.bounces[i] > 0) {
        pool.y[i] = pool.floorY[i];
        pool.vy[i] = -pool.vy[i] * pool.bounce[i];
        pool.vx[i] *= 0.8;
        pool.bounces[i] -= 1;
      }
    }
    if (pool.align[i] === 1) pool.rot[i] = Math.atan2(pool.vy[i], pool.vx[i]);
    else pool.rot[i] += pool.vrot[i] * dtSec;
  }
}

/** Size (half-size px) for particle i at its current age. */
export function particleSize(pool: ParticlePool, i: number): number {
  'worklet';
  const t = pool.age[i] / pool.life[i];
  const u = 1 - (1 - t) * (1 - t);
  let s = pool.size0[i] + (pool.size1[i] - pool.size0[i]) * u;
  // Birth pop: 60% -> 100% over the first 8% of life.
  if (t < 0.08) s *= 0.6 + 0.4 * (t / 0.08);
  return s;
}

/** Alpha 0..1 for particle i (fade-in/fade-out fractions of life). */
export function particleAlpha(pool: ParticlePool, i: number): number {
  'worklet';
  if (pool.alive[i] === 0) return 0;
  const t = pool.age[i] / pool.life[i];
  const fi = pool.fadeIn[i];
  const fo = pool.fadeOut[i];
  let a = 1;
  if (fi > 0 && t < fi) a = t / fi;
  if (fo > 0 && t > 1 - fo) a = Math.min(a, (1 - t) / fo);
  return a < 0 ? 0 : a;
}

/** Sprite index for particle i, including flutter/flip frames. */
export function particleSprite(pool: ParticlePool, i: number): number {
  'worklet';
  const frames = pool.frames[i];
  if (frames <= 1) return pool.sprite[i];
  // |cos(phase)| picks a foreshortening frame: 0 = face-on, frames-1 = edge-on.
  const c = Math.abs(Math.cos(pool.phase[i]));
  let f = Math.floor((1 - c) * frames);
  if (f >= frames) f = frames - 1;
  return pool.sprite[i] + f;
}

export function clearParticles(pool: ParticlePool): void {
  'worklet';
  for (let i = 0; i < pool.cap; i++) pool.alive[i] = 0;
  pool.live = 0;
  pool.layerLive[0] = 0;
  pool.layerLive[1] = 0;
  pool.layerLive[2] = 0;
}

/** Read and reset the magnet arrival counter (coin ticks, haptics). */
export function takeArrivals(pool: ParticlePool): number {
  'worklet';
  const n = pool.arrivals;
  pool.arrivals = 0;
  return n;
}
