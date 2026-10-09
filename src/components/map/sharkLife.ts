/**
 * The map shark's idle life, as pure rules (unit tested in tools/tests/map-motion.test.cjs).
 * Benchmarks: an Animal Crossing villager or a Club Penguin penguin left alone is never a
 * statue; it fidgets now and then, never on a metronome, and never while busy walking.
 */
export type SharkMood = 'tap' | 'cheer' | 'hop' | 'wiggle' | 'look' | 'show';

/** A standing shark fidgets once every 7 to 12 s (random inside the window). */
export const FIDGET_GAP_MS: readonly [number, number] = [7000, 12000];

const PLAIN: readonly SharkMood[] = ['look', 'hop', 'wiggle', 'look', 'wiggle', 'hop'];
const DRESSED: readonly SharkMood[] = ['look', 'show', 'hop', 'wiggle', 'show', 'look'];

/** The n-th idle fidget: a varied cycle; a shark wearing a moving piece shows it off every few. */
export function nextFidget(n: number, hasMovingPiece: boolean): SharkMood {
  const list = hasMovingPiece ? DRESSED : PLAIN;
  return list[((n % list.length) + list.length) % list.length];
}

/** While a ride coin is in range: one cheer on arrival, then one this often. */
export const CHEER_REPEAT_MS = 20000;

export type TapTrick = 'twirl' | 'flip' | 'bounce' | 'wiggle';
/** The n-th tap's trick: twirl, loop, double bounce in turn. A lettered outfit never mirrors: wiggle instead of twirl. */
export function tapTrick(n: number, canMirror: boolean): TapTrick {
  const t = (['twirl', 'flip', 'bounce'] as const)[((n % 3) + 3) % 3];
  return t === 'twirl' && !canMirror ? 'wiggle' : t;
}
