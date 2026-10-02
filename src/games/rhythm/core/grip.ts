/**
 * grip: which part of the drum face a touch lands on (design 3.3, rev 7).
 *
 * Colour equals input zone (Taiko): blue = DRUM, coral = RIM. Two grips:
 *
 *   One Thumb (the only default): centre head = DRUM, both rim bands = RIM. The
 *     thumb-side rim is widened: right thumb -> left rim 20%, centre 40%,
 *     right rim 40%; mirrored for a left thumb.
 *   Two Thumbs (opt-in only, offered once after 3 d2 clears with no MARCH
 *     sections): left half = DRUM, right half = RIM; "Swap sides" puts RIM
 *     on the left.
 *
 * 16 pt dead bands at every boundary count for either zone. Pure worklets,
 * shared by the gesture handler, the drum-face drawing and the tests.
 */

import { Z_CENTRE, Z_DEAD_L, Z_DEAD_R, Z_RIM_L, Z_RIM_R } from './types';

export const GRIP_ONE = 0;
export const GRIP_TWO = 1;
/** A chart with no RIM notes (First Parade, Opening Day d1, the ride sprint): the whole drum is blue. */
export const GRIP_ALL = 2;
export const DEAD_BAND = 16;

export interface GripPrefs {
  /** 0 One Thumb, 1 Two Thumbs (the player accepted the prompt); -1 = default (One Thumb). */
  grip: number;
  /** 1 right thumb, -1 left thumb. */
  hand: number;
  /** Two Thumbs: RIM on the left. */
  swap: number;
}

export const DEFAULT_GRIP: GripPrefs = { grip: -1, hand: 1, swap: 0 };

export function gripFor(prefs: GripPrefs, difficulty: number, format: 'queue' | 'ride', hasRim = true): number {
  'worklet';
  if (!hasRim) return GRIP_ALL;
  if (format === 'ride') return GRIP_ONE;
  return prefs.grip === GRIP_TWO && difficulty >= 2 ? GRIP_TWO : GRIP_ONE;
}

/**
 * Zone boundaries as fractions of the width, left to right, with the zone
 * kind of each span (0 blue DRUM, 1 coral RIM). Used for drawing.
 */
export function gripSpans(grip: number, hand: number, swap: number): number[] {
  'worklet';
  // [x0, x1, kind, x0, x1, kind, ...]
  if (grip === GRIP_ALL) return [0, 1, 0];
  if (grip === GRIP_TWO) return swap ? [0, 0.5, 1, 0.5, 1, 0] : [0, 0.5, 0, 0.5, 1, 1];
  return hand < 0 ? [0, 0.4, 1, 0.4, 0.8, 0, 0.8, 1, 1] : [0, 0.2, 1, 0.2, 0.6, 0, 0.6, 1, 1];
}

/** Touch x -> judge zone code (Z_*). */
export function zoneOf(x: number, width: number, grip: number, hand: number, swap: number): number {
  'worklet';
  const half = DEAD_BAND / 2;
  if (grip === GRIP_ALL) return Z_CENTRE;
  if (grip === GRIP_TWO) {
    const mid = width / 2;
    if (Math.abs(x - mid) <= half) return x < mid ? Z_DEAD_L : Z_DEAD_R;
    const left = x < mid;
    const rimSide = swap ? left : !left;
    return rimSide ? (left ? Z_RIM_L : Z_RIM_R) : Z_CENTRE;
  }
  const a = width * (hand < 0 ? 0.4 : 0.2);
  const b = width * (hand < 0 ? 0.8 : 0.6);
  if (Math.abs(x - a) <= half) return Z_DEAD_L;
  if (Math.abs(x - b) <= half) return Z_DEAD_R;
  if (x < a) return Z_RIM_L;
  if (x > b) return Z_RIM_R;
  return Z_CENTRE;
}

/**
 * Handedness from the mean x of the first 20 touch-downs (design 3.1):
 * right of 205/390 = right thumb, left of 185/390 = left thumb, otherwise
 * unchanged. Returns the new hand.
 */
export function detectHand(xs: readonly number[], width: number, current: number): number {
  if (xs.length < 20) return current;
  let s = 0;
  for (let i = 0; i < 20; i++) s += xs[i];
  const m = (s / 20) * (390 / width);
  if (m > 205) return 1;
  if (m < 185) return -1;
  return current;
}
