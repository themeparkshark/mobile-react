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

/**
 * How long to ease from a to b: 600 ms for a step, up to 1 s for a stride; 0
 * means jump. With `sinceLastMs` (time since the previous fix) a walk's glide
 * stretches to fill the gap between fixes (still at most 1 s), so the shark
 * keeps moving instead of waiting for the next fix.
 */
export function glideDurationMs(a: GlidePoint, b: GlidePoint, sinceLastMs?: number): number {
  const d = glideMeters(a, b);
  if (!Number.isFinite(d) || d < GLIDE_MIN_M || d > GLIDE_MAX_M) return 0;
  const byDistance = Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, d * 80));
  const byCadence = sinceLastMs !== undefined && Number.isFinite(sinceLastMs) ? Math.min(GLIDE_MAX_MS, sinceLastMs) : 0;
  return Math.round(Math.max(byDistance, byCadence));
}

/**
 * Half linear, half ease-out: leaves at 1.5x the average speed and lands at
 * half of it, so a steady walk (a fix every second) reads as one continuous
 * stride instead of a surge and a stop on every fix.
 */
export function glideEase(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 0.5 * c + 0.5 * (1 - (1 - c) ** 2);
}

/** The same ease as a Reanimated worklet (UI-thread glide). */
export function glideEaseWorklet(t: number): number {
  'worklet';
  const c = Math.min(1, Math.max(0, t));
  return 0.5 * c + 0.5 * (1 - (1 - c) ** 2);
}

export function glidePoint(a: GlidePoint, b: GlidePoint, t: number): GlidePoint {
  if (t >= 1) return { latitude: b.latitude, longitude: b.longitude };
  const k = glideEase(t);
  return { latitude: a.latitude + (b.latitude - a.latitude) * k, longitude: a.longitude + (b.longitude - a.longitude) * k };
}
