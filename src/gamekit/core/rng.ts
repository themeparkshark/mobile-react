/**
 * rng.ts: seeded randomness for every studio game.
 *
 * Deterministic, allocation-free and worklet-safe (every function carries the
 * 'worklet' directive, so it runs on the UI thread inside useFrameCallback and
 * in node tests unchanged). The same seed always produces the same run, which
 * is what server-authoritative proofs, ghost runs and replays depend on.
 *
 * State is a plain mutable object `{ s }` (uint32) so it can live inside a
 * SharedValue or a sim struct.
 *
 *   const r = createRng(deriveRunSeed(daySeed, runIndex));
 *   const lane = rngInt(r, 0, 2);
 *   const kind = rngWeighted(r, [70, 20, 10]);
 */

export interface Rng {
  /** Current uint32 state. Serialisable: snapshot = { s }. */
  s: number;
}

/** 32-bit FNV-1a over a string. Stable across JS engines and PHP. */
export function hashString(text: string): number {
  'worklet';
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Avalanche-mix two uint32 values into one (murmur3 finaliser). */
export function mixSeed(a: number, b: number): number {
  'worklet';
  let h = (a ^ Math.imul(b >>> 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Seed for run N of a session/day. Replays of the same run index are exact;
 * a new run always gets a different board ("one more run" never repeats).
 */
export function deriveRunSeed(baseSeed: number, runIndex: number): number {
  'worklet';
  return mixSeed(baseSeed >>> 0, (runIndex + 1) >>> 0);
}

export function createRng(seed: number): Rng {
  'worklet';
  // Zero is a valid mulberry32 state, but mixing avoids weak small seeds.
  return { s: mixSeed(seed >>> 0, 0x6d2b79f5) };
}

/** mulberry32: next uint32. */
export function rngU32(r: Rng): number {
  'worklet';
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Float in [0, 1). */
export function rngFloat(r: Rng): number {
  'worklet';
  return rngU32(r) / 4294967296;
}

/** Float in [min, max). */
export function rngRange(r: Rng, min: number, max: number): number {
  'worklet';
  return min + (max - min) * rngFloat(r);
}

/** Integer in [min, max] inclusive. */
export function rngInt(r: Rng, min: number, max: number): number {
  'worklet';
  return min + Math.floor(rngFloat(r) * (max - min + 1));
}

export function rngChance(r: Rng, p: number): boolean {
  'worklet';
  return rngFloat(r) < p;
}

/** Symmetric jitter: value * (1 +/- amount). */
export function rngJitter(r: Rng, value: number, amount: number): number {
  'worklet';
  return value * (1 + (rngFloat(r) * 2 - 1) * amount);
}

/** Approximately normal (mean 0, sd 1), Box-Muller. */
export function rngGaussian(r: Rng): number {
  'worklet';
  let u = rngFloat(r);
  if (u < 1e-9) u = 1e-9;
  const v = rngFloat(r);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function rngPick<T>(r: Rng, list: readonly T[]): T {
  'worklet';
  return list[Math.floor(rngFloat(r) * list.length)];
}

/** Fisher-Yates in place. Returns the same array. */
export function rngShuffle<T>(r: Rng, list: T[]): T[] {
  'worklet';
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rngFloat(r) * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

/** Index chosen proportionally to non-negative weights. -1 when all are 0. */
export function rngWeighted(r: Rng, weights: readonly number[]): number {
  'worklet';
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i] > 0 ? weights[i] : 0;
  if (total <= 0) return -1;
  let roll = rngFloat(r) * total;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] > 0 ? weights[i] : 0;
    if (roll < w) return i;
    roll -= w;
  }
  return weights.length - 1;
}

// =============================================================================
// Replay variety
// =============================================================================

/**
 * Shuffle bag: every item appears once per cycle, in a seeded order, and the
 * first item of a new cycle is never the last item of the previous one. This
 * is how patterns, formations and themes avoid "same thing twice" streaks.
 */
export interface ShuffleBag {
  items: number[];
  cursor: number;
  last: number;
  rng: Rng;
}

export function createShuffleBag(size: number, seed: number): ShuffleBag {
  'worklet';
  const items: number[] = [];
  for (let i = 0; i < size; i++) items.push(i);
  const bag: ShuffleBag = { items, cursor: size, last: -1, rng: createRng(seed) };
  return bag;
}

export function bagNext(bag: ShuffleBag): number {
  'worklet';
  const n = bag.items.length;
  if (n === 0) return -1;
  if (bag.cursor >= n) {
    rngShuffle(bag.rng, bag.items);
    if (n > 1 && bag.items[0] === bag.last) {
      const tmp = bag.items[0];
      bag.items[0] = bag.items[n - 1];
      bag.items[n - 1] = tmp;
    }
    bag.cursor = 0;
  }
  const value = bag.items[bag.cursor];
  bag.cursor += 1;
  bag.last = value;
  return value;
}

/**
 * Weighted pick that avoids anything in `recent` (the last few choices). Falls
 * back to the plain weighted pick when every option is recent. Used for
 * run-to-run variety: twists, bosses, themes, question categories.
 */
export function pickFresh(r: Rng, weights: readonly number[], recent: readonly number[]): number {
  'worklet';
  const masked: number[] = [];
  let any = false;
  for (let i = 0; i < weights.length; i++) {
    let blocked = false;
    for (let j = 0; j < recent.length; j++) if (recent[j] === i) blocked = true;
    const w = blocked ? 0 : weights[i];
    if (w > 0) any = true;
    masked.push(w);
  }
  return rngWeighted(r, any ? masked : weights);
}

/** Push into a fixed-length recent list (most recent last). Returns the list. */
export function rememberRecent(recent: number[], value: number, keep: number): number[] {
  'worklet';
  recent.push(value);
  while (recent.length > keep) recent.shift();
  return recent;
}
