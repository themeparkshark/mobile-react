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
/**
 * A walk's glide may stretch to the expected gap between fixes, up to this long:
 * iOS sends a walking fix every 2 to 3 s on a map (3 m steps) and every ~7 s
 * elsewhere in a park (10 m steps). Filling the gap keeps the shark moving at
 * walking pace instead of a 1 s dash and a long stand.
 */
export const GLIDE_CADENCE_MAX_MS = 8000;
/** A cadence-stretched glide never crawls slower than this (m/s): a short step is not dragged out. */
export const GLIDE_MIN_SPEED_MPS = 0.5;
/** Gaps longer than this (a silence, the background) never stretch the expected gap. */
export const FIX_GAP_CAP_MS = 8000;

/** The one fix-cadence estimate a map shares between its camera and its shark marker. */
export interface FixCadence { key: string; at: number; gap: number }
export function newFixCadence(): FixCadence { return { key: '', at: 0, gap: 0 }; }

/**
 * Notes a fix (by a key such as "lat,lng") and returns the expected gap between
 * fixes. Idempotent per key: the camera and the marker both call it for the same
 * fix and get the same answer, whichever runs first.
 */
export function noteFixCadence(c: FixCadence, key: string, now: number): number {
  if (c.key !== key) {
    if (c.at > 0) c.gap = nextFixGap(c.gap, now - c.at);
    c.key = key;
    c.at = now;
  }
  return c.gap;
}

/** Running estimate of the time between fixes (ms): a smoothed average of real gaps. */
export function nextFixGap(previousEstimate: number, sinceLastMs: number): number {
  if (!Number.isFinite(sinceLastMs) || sinceLastMs <= 0) return previousEstimate;
  const gap = Math.min(FIX_GAP_CAP_MS, sinceLastMs);
  return previousEstimate > 0 ? 0.6 * previousEstimate + 0.4 * gap : gap;
}

export function glideMeters(a: GlidePoint, b: GlidePoint): number {
  const dy = (b.latitude - a.latitude) * 111_320;
  const dx = (b.longitude - a.longitude) * 111_320 * Math.cos(((a.latitude + b.latitude) / 2) * Math.PI / 180);
  return Math.hypot(dx, dy);
}

/**
 * How long to ease from a to b: 600 ms for a step, up to 1 s for a stride; 0
 * means jump. With `sinceLastMs` (the expected gap between fixes, nextFixGap) a
 * walk's glide stretches to fill that gap (at most GLIDE_CADENCE_MAX_MS), so the
 * shark keeps moving at walking pace instead of waiting for the next fix.
 */
export function glideDurationMs(a: GlidePoint, b: GlidePoint, sinceLastMs?: number): number {
  const d = glideMeters(a, b);
  if (!Number.isFinite(d) || d < GLIDE_MIN_M || d > GLIDE_MAX_M) return 0;
  const byDistance = Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, d * 80));
  const byCadence = sinceLastMs !== undefined && Number.isFinite(sinceLastMs)
    ? Math.min(GLIDE_CADENCE_MAX_MS, sinceLastMs, (d / GLIDE_MIN_SPEED_MPS) * 1000) : 0;
  return Math.round(Math.max(byDistance, byCadence));
}

/**
 * Mostly linear with a touch of ease-out: leaves at 1.2x the average speed and
 * lands at 0.8x, so back-to-back glides on a steady walk read as one even
 * stride, while a final step still settles softly.
 */
export function glideEase(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 0.8 * c + 0.2 * (1 - (1 - c) ** 2);
}

/** The same ease as a Reanimated worklet (UI-thread glide). */
export function glideEaseWorklet(t: number): number {
  'worklet';
  const c = Math.min(1, Math.max(0, t));
  return 0.8 * c + 0.2 * (1 - (1 - c) ** 2);
}

export function glidePoint(a: GlidePoint, b: GlidePoint, t: number): GlidePoint {
  if (t >= 1) return { latitude: b.latitude, longitude: b.longitude };
  const k = glideEase(t);
  return { latitude: a.latitude + (b.latitude - a.latitude) * k, longitude: a.longitude + (b.longitude - a.longitude) * k };
}
