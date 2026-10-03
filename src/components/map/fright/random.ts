/**
 * Seeded randomness for the fright layer: every timing is randomized, yet a
 * given seed replays the same night (tests, captures). Pure.
 */

/** mulberry32: a tiny fast PRNG. Returns a function giving floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = (Math.floor(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One deterministic float in [0, 1) for (seed, n). */
export function randAt(seed: number, n: number): number {
  return seededRandom((Math.floor(seed) * 2654435761 + Math.floor(n) * 40503 + 17) >>> 0)();
}

/** Stable 32-bit hash of a string (FNV-1a), for per-spot seeds. */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
