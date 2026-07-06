/**
 * rng.ts — tiny deterministic PRNG (mulberry32).
 *
 * Deterministic so a round is fully reproducible from {seed}: the same seed
 * yields the same spawn stream. The engine reports the seed in its result meta
 * so the server can replay/verify without trusting a client-computed score
 * (quality bar #6, server-authoritative).
 *
 * Both functions are worklets: the simulation runs on the UI thread and pulls
 * randomness inside the frame loop. State is a single uint32 carried in a
 * SharedValue by the caller.
 */

/** Advance state and return the next uint32. Mutates via the returned value. */
export function nextU32(state: number): number {
  'worklet';
  let a = (state + 0x6d2b79f5) | 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Next float in [0,1). Returns [value, nextState] so callers thread state. */
export function nextFloat(state: number): { value: number; state: number } {
  'worklet';
  const s = (state + 0x6d2b79f5) | 0;
  const n = nextU32(state);
  return { value: n / 4294967296, state: s };
}

/** Derive a stable 32-bit seed from an arbitrary number (e.g. Date.now()). */
export function makeSeed(input: number): number {
  let h = input >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}
