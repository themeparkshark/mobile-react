/**
 * Pure helpers for the player shark's UI-thread motion (PlayerSharkMarker).
 * Unit tested in tools/tests/player-motion.test.cjs.
 */
import type { GlidePoint } from './glide';

/** After a marker's coordinate changes, wait this long before showing that copy (the native move lands in 1 to 3 frames). */
export const SWAP_SETTLE_MS = 150;

const M_PER_DEG = 111_320;

/** Metres east and north of `origin` (flat earth: exact to millimetres over a park). */
export function metersEastNorth(origin: GlidePoint, p: GlidePoint): [number, number] {
  'worklet';
  const k = Math.cos(((origin.latitude + p.latitude) / 2) * Math.PI / 180);
  return [(p.longitude - origin.longitude) * M_PER_DEG * k, (p.latitude - origin.latitude) * M_PER_DEG];
}

/**
 * A ground offset (metres east, north) as a screen offset (points right, down)
 * on a map drawn at `ppm` points per metre and turned to `bearingDeg` (the
 * compass direction at the top of the screen).
 */
export function screenOffset(east: number, north: number, ppm: number, bearingDeg: number): [number, number] {
  'worklet';
  const b = bearingDeg * Math.PI / 180;
  const c = Math.cos(b), s = Math.sin(b);
  return [(east * c - north * s) * ppm, -(east * s + north * c) * ppm];
}

/** Compass course (degrees, 0 = north, clockwise) from a to b, or null for a step under `minMeters`. */
export function courseDeg(a: GlidePoint, b: GlidePoint, minMeters = 1): number | null {
  const [e, n] = metersEastNorth(a, b);
  if (Math.hypot(e, n) < minMeters) return null;
  const deg = Math.atan2(e, n) * 180 / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

/**
 * Wake rotation (radians) so it streams opposite the travel direction on
 * screen: 0 (straight down) when walking toward the top of the screen.
 */
export function wakeTurn(course: number, bearingDeg: number): number {
  'worklet';
  return ((course - bearingDeg) * Math.PI) / 180;
}
