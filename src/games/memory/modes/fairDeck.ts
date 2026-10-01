/**
 * modes/fairDeck.ts: the Fair Deck face-binding policy (design v8 3.5).
 *
 * Used by the Daily, Line Duel and Race. No layout exists: a slot's face is
 * bound the moment that slot is first flipped, by a public policy:
 *
 *   1. While any face has no revealed copy yet, a newly flipped slot gets the
 *      next face from the seeded novelty order (so a first sight never matches).
 *   2. Otherwise it gets the second copy of a half-known face, chosen by
 *      pick(seed, k) mod |H| over the half-known faces sorted by first-reveal
 *      order (k counts rule-2 binds). On a second flip B, A's own face is
 *      excluded unless it is the only one left (a forced match, scored lucky).
 *
 * Consequences (proven in tests): no unforced first-sight match, so luck is
 * equal and zero for every player; the k-th new face is identical for every
 * player on a seed; a perfect player needs exactly ceil(n/2) + n turns.
 *
 * The server uses HMAC-SHA256(seed, k) for `pick` and stores only the seed;
 * this module's default pick is FNV-1a over `fd:${seed}:${k}` for the
 * in-process stand-in and the parity vectors. The PHP port takes `pick` as a
 * strategy so both can be checked.
 */

import { FACE_UNKNOWN } from '../engine';
import { makeRng } from '../logic';

export type FairPick = (seed: number, k: number) => number;

export function fnvPick(seed: number, k: number): number {
  const str = `fd:${seed >>> 0}:${k}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface FairDeck {
  seed: number;
  pairs: number;
  /** Deck face ids in novelty order (length = pairs). */
  novelty: number[];
  /** Bound face per slot (-1 unbound). */
  slots: number[];
  /** Copies revealed per face. */
  copies: Map<number, number>;
  /** Faces with exactly one revealed copy, in first-reveal order. */
  half: number[];
  nextNew: number;
  k: number;
  pick: FairPick;
}

/**
 * `faces` is the face set of the board (e.g. the Daily's face set of the day);
 * its order is shuffled into the novelty order by `seed`.
 */
export function createFairDeck(seed: number, faces: number[], cols: number, rows: number, pick: FairPick = fnvPick): FairDeck {
  const n = cols * rows;
  const pairs = n / 2;
  const pool = faces.slice(0, pairs);
  const rng = makeRng(seed ^ 0x5fa1dec);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  const slots: number[] = [];
  for (let i = 0; i < n; i++) slots.push(FACE_UNKNOWN);
  return { seed, pairs, novelty: pool, slots, copies: new Map(), half: [], nextNew: 0, k: 0, pick };
}

/**
 * Bind (or read) the face at `slot`. `aFace` is the face of the turn's first
 * card when this is the second flip B, else null.
 */
export function fairFlip(d: FairDeck, slot: number, aFace: number | null): number {
  const bound = d.slots[slot];
  if (bound !== FACE_UNKNOWN) return bound;
  let face: number;
  if (d.nextNew < d.novelty.length) {
    face = d.novelty[d.nextNew];
    d.nextNew += 1;
  } else {
    let cand = d.half.slice();
    if (aFace != null && cand.length > 1) cand = cand.filter((f) => f !== aFace);
    if (!cand.length) throw new Error('fair deck exhausted');
    face = cand[d.pick(d.seed, d.k) % cand.length];
    d.k += 1;
  }
  d.slots[slot] = face;
  const c = (d.copies.get(face) ?? 0) + 1;
  d.copies.set(face, c);
  if (c === 1) d.half.push(face);
  else d.half = d.half.filter((f) => f !== face);
  return face;
}

/** Audit replay: re-run a session's flip order on the revealed seed. */
export function fairReplay(seed: number, faces: number[], cols: number, rows: number, flips: { slot: number; aFace: number | null }[], pick: FairPick = fnvPick): number[] {
  const d = createFairDeck(seed, faces, cols, rows, pick);
  return flips.map((f) => fairFlip(d, f.slot, f.aFace));
}
