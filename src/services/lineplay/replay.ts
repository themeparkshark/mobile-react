/**
 * Replay variety for queue rounds. The first play of a round uses its stable
 * playlist seed (so a resumed wait shows the same board); every later play
 * mixes in the play count, so "Play again" never deals the identical round.
 */

export type QueueDifficulty = 1 | 2 | 3;

/** A well-mixed 32-bit hash of (seed, plays). plays = 0 keeps the seed. */
export function replaySeed(seed: number, plays: number): number {
  const base = (Math.floor(Number.isFinite(seed) ? seed : 0) >>> 0);
  const count = Math.max(0, Math.floor(Number.isFinite(plays) ? plays : 0));
  if (count === 0) return base;
  let h = (base ^ Math.imul(count, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  // Never collide with the original board, even for an unlucky hash.
  return h === base ? (h + 1) >>> 0 : h;
}

/** Stars earned from the shell's default multiplier map (1x, 1.5x, 2x). */
export function starsFromMultiplier(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return 0;
  if (multiplier >= 2) return 3;
  if (multiplier >= 1.5) return 2;
  return 1;
}

/** A 2+ star run earns a harder next round; the step never passes 3. */
export function nextQueueDifficulty(current: QueueDifficulty | undefined, stars: number): QueueDifficulty {
  const level = current ?? 1;
  if (stars >= 2) return Math.min(3, level + 1) as QueueDifficulty;
  return level;
}

export function isQueueDifficulty(value: unknown): value is QueueDifficulty {
  return value === 1 || value === 2 || value === 3;
}
