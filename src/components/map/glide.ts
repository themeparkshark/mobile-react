/**
 * The shark's glide between GPS fixes. Pure, unit tested
 * (tools/tests/position-filter.test.cjs).
 */
export interface GlidePoint { readonly latitude: number; readonly longitude: number }

/** A step shorter than this is drawn at once (nothing to see). */
export const GLIDE_MIN_M = 0.3;
/** Longer than this is a re-seat (back from the car, the background): jump, do not fly across the map. */
export const GLIDE_MAX_M = 150;
export const GLIDE_MIN_MS = 600;
export const GLIDE_MAX_MS = 1000;

export function glideMeters(a: GlidePoint, b: GlidePoint): number {
  const dy = (b.latitude - a.latitude) * 111_320;
  const dx = (b.longitude - a.longitude) * 111_320 * Math.cos(((a.latitude + b.latitude) / 2) * Math.PI / 180);
  return Math.hypot(dx, dy);
}

/** How long to ease from a to b: 600 ms for a step, up to 1 s for a stride; 0 means jump. */
export function glideDurationMs(a: GlidePoint, b: GlidePoint): number {
  const d = glideMeters(a, b);
  if (!Number.isFinite(d) || d < GLIDE_MIN_M || d > GLIDE_MAX_M) return 0;
  return Math.round(Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, d * 80)));
}

/** Ease-out cubic: quick to leave, soft to land. */
export function glideEase(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

export function glidePoint(a: GlidePoint, b: GlidePoint, t: number): GlidePoint {
  if (t >= 1) return { latitude: b.latitude, longitude: b.longitude };
  const k = glideEase(t);
  return { latitude: a.latitude + (b.latitude - a.latitude) * k, longitude: a.longitude + (b.longitude - a.longitude) * k };
}
